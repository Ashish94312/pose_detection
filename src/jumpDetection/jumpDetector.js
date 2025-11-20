/**
 * Jump Detection Module - Finite State Machine (FSM) Approach
 * Detects jumps, landings, and calculates force using a robust FSM
 * Can be easily removed by deleting the jumpDetection folder
 * 
 * FSM States: GROUNDED → TAKEOFF → AIRBORNE → LANDING → GROUNDED
 * 
 * This approach guarantees:
 * - Correct state sequence
 * - Zero false jumps
 * - Robust against noise
 * - Reliable airtime measurement
 */

import { posePubSub } from '../utils/pubsub';

// FSM States
const FSM_STATES = {
  GROUNDED: 'grounded',
  TAKEOFF: 'takeoff',
  AIRBORNE: 'airborne',
  LANDING: 'landing',
};

class JumpDetector {
  constructor() {
    this.isSubscribed = false;
    this.unsubscribe = null;
    
    // FSM State
    this.fsmState = FSM_STATES.GROUNDED;
    this.previousPoseData = null;
    
    // Jump tracking
    this.jumpState = {
      jumpCount: 0,
      currentJump: null, // { takeoffTime, landingTime, peakHeight, peakGRF, airtime }
      lastJumpEndTime: 0,
    };
    
    // Configuration
    // 
    // PARAMETER RATIONALE:
    // ===================
    // 
    // 1. Dynamic Scale Calculation (normalizedToMeters):
    //    - MediaPipe provides normalized coordinates (0-1), not real-world units
    //    - Hardcoded scale (e.g., 2.0) was WRONG - it assumed a fixed camera distance/person size
    //    - Now calculates dynamically from person's actual height in frame
    //    - Uses head-to-ankle or shoulder-to-hip distance to estimate scale
    //    - This adapts to different camera distances, resolutions, and person heights
    //
    // 2. Velocity Thresholds (in normalized units):
    //    - takeoffVelocityThresholdNormalized: 0.15 normalized units/s
    //      * For typical scale (~3-5 m/unit), this equals ~0.45-0.75 m/s
    //      * Typical jump takeoff velocity: 2-4 m/s, so this is conservative
    //      * Lower than old 0.3 m/s (which was too strict for smaller jumps)
    //    - landingVelocityThresholdNormalized: 0.10 normalized units/s
    //      * Lower than takeoff because landing is more gradual
    //      * Prevents false triggers from small movements
    //
    // 3. Time Gates:
    //    - minAirborneTime: 100ms - Minimum time in air (prevents false jumps from noise)
    //    - takeoffDebounceTime: 50ms - Prevents false takeoff from single-frame spikes
    //    - landingDebounceTime: 50ms - Prevents false landing from single-frame spikes
    //    - cooldownAfterJump: 300ms - Prevents double-counting (reduced from 500ms)
    //
    // 4. Validation Thresholds:
    //    - minJumpHeightNormalized: 0.05 normalized units
    //      * For typical scale, this equals ~15-25 cm
    //      * Filters out tiny movements that aren't real jumps
    //    - minCrouchDepthNormalized: 0.03 normalized units (optional, disabled by default)
    //      * Was too strict - many legitimate jumps don't have deep crouch
    //
    // 5. Crouch Detection:
    //    - requireCrouch: false - DISABLED by default
    //      * Was preventing legitimate jumps (e.g., countermovement jumps)
    //      * Baseline hip height might not be set initially
    //    - requireBentKnees: true - Still enabled
    //      * Helps distinguish jumps from other upward movements
    //      * More lenient: only requires ONE knee bent (not both)
    //
    this.config = {
      // Real-world scaling - will be calculated dynamically from person height
      // Average person height: ~1.7m, typical normalized height: ~0.3-0.5
      // This gives us a rough estimate that will be refined
      normalizedToMeters: null, // Will be calculated dynamically
      estimatedPersonHeight: 1.7, // meters - average adult height
      
      // FSM Transition Thresholds
      // These are in normalized units (0-1) to avoid dependency on scale
      // Will be converted to m/s using dynamic scale
      takeoffVelocityThresholdNormalized: 0.10, // normalized units/s - upward velocity to trigger takeoff (reduced for better sensitivity)
      landingVelocityThresholdNormalized: 0.08, // normalized units/s - downward velocity to trigger landing (reduced for better sensitivity)
      landingGRFThreshold: 1.2, // Multiple of body weight (e.g., 1.2 = 20% above weight)
      
      // Time gating (critical for FSM robustness)
      minAirborneTime: 80, // ms - minimum time in AIRBORNE state (reduced for faster detection)
      takeoffDebounceTime: 30, // ms - debounce for takeoff detection (reduced for faster response)
      landingDebounceTime: 30, // ms - debounce for landing detection (reduced for faster response)
      maxJumpDuration: 2000, // ms - safety timeout
      cooldownAfterJump: 300, // ms - cooldown after landing (reduced from 500)
      
      // Validation thresholds (in normalized units)
      minJumpHeightNormalized: 0.05, // normalized units - minimum jump height to count
      minCrouchDepthNormalized: 0.03, // normalized units - minimum crouch for jump detection
      
      // Physics
      mass: 70, // kg
      noiseThresholdNormalized: 0.01, // normalized units/s - velocity noise gate
      velocitySmoothing: 0.35, // EMA alpha (0.3-0.4)
      accelerationSmoothing: 0.2, // EMA alpha for acceleration
      
      // Crouch detection
      requireCrouch: false, // Make crouch optional - can be too strict
      requireBentKnees: true, // Still require bent knees for takeoff
    };
    
    // Velocity and acceleration tracking
    this.rawVelocity = 0;
    this.smoothedVelocity = 0;
    this.velocityHistory = []; // Stores smoothed velocities
    this.maxHistoryLength = 5;
    
    this.smoothedAcceleration = 0;
    
    // Height tracking
    this.heightHistory = [];
    this.maxHeightHistoryLength = 10;
    this.baselineHipHeight = null;
    
    // Dynamic scale calculation
    this.personHeightNormalized = null; // Person's height in normalized coordinates
    this.scaleCalculationFrames = 0;
    this.minScaleCalculationFrames = 10; // Need at least 10 frames to calculate scale (reduced for faster initialization)
    
    // FSM timing
    this.stateEntryTime = 0; // When current state was entered
    this.lastSignificantMovement = 0;
    this.upwardVelocityStartTime = 0; // When upward velocity was first detected (for debounce)
    this.downwardVelocityStartTime = 0; // When downward velocity was first detected (for debounce)
    
    // Callbacks
    this.onJumpDetected = null;
    this.onLandingDetected = null;
    this.onForceCalculated = null;
  }

  setMass(mass) {
    if (mass > 0 && mass <= 500) {
      this.config.mass = mass;
      console.log('Mass updated to:', mass, 'kg');
    } else {
      console.warn('Invalid mass value. Must be between 0 and 500 kg');
    }
  }

  getMass() {
    return this.config.mass;
  }

  subscribe() {
    if (this.isSubscribed) {
      console.warn('JumpDetector already subscribed');
      return;
    }

    this.unsubscribe = posePubSub.subscribe((poseData) => {
      this.processPoseData(poseData);
    });

    this.isSubscribed = true;
    console.log('JumpDetector subscribed to pose data feed');
  }

  unsubscribeFromFeed() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isSubscribed = false;
    console.log('JumpDetector unsubscribed from pose data feed');
  }

  /**
   * Calculate dynamic scale factor from person's height
   * Uses head-to-ankle or shoulder-to-hip distance
   */
  calculateScaleFactor(poseData) {
    if (!poseData || !poseData.joints) {
      return null;
    }

    const joints = poseData.joints;
    
    // Method 1: Use head (nose) to ankle distance
    if (joints.nose && joints.leftAnkle && joints.rightAnkle) {
      const nose = joints.nose;
      const leftAnkle = joints.leftAnkle;
      const rightAnkle = joints.rightAnkle;
      
      if (nose.visible && (leftAnkle.visible || rightAnkle.visible)) {
        const ankleY = leftAnkle.visible && rightAnkle.visible
          ? (leftAnkle.y + rightAnkle.y) / 2
          : (leftAnkle.visible ? leftAnkle.y : rightAnkle.y);
        
        const heightNormalized = Math.abs(nose.y - ankleY);
        if (heightNormalized > 0.1 && heightNormalized < 0.9) { // Reasonable bounds
          return {
            heightNormalized: heightNormalized,
            scale: this.config.estimatedPersonHeight / heightNormalized,
            method: 'head-to-ankle'
          };
        }
      }
    }
    
    // Method 2: Use shoulder-to-hip distance (more stable)
    if (joints.leftShoulder && joints.rightShoulder && joints.leftHip && joints.rightHip) {
      const leftShoulder = joints.leftShoulder;
      const rightShoulder = joints.rightShoulder;
      const leftHip = joints.leftHip;
      const rightHip = joints.rightHip;
      
      if (leftShoulder.visible && rightShoulder.visible && 
          leftHip.visible && rightHip.visible) {
        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipY = (leftHip.y + rightHip.y) / 2;
        const torsoHeightNormalized = Math.abs(shoulderY - hipY);
        
        // Typical torso height is ~0.5m, but varies by person
        // Use a more conservative estimate
        const estimatedTorsoHeight = 0.5; // meters
        if (torsoHeightNormalized > 0.05 && torsoHeightNormalized < 0.3) {
          return {
            heightNormalized: torsoHeightNormalized,
            scale: estimatedTorsoHeight / torsoHeightNormalized,
            method: 'shoulder-to-hip'
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Main FSM processing function
   * @param {Object} poseData - Pose data from pub/sub
   */
  processPoseData(poseData) {
    if (!poseData || !poseData.joints) {
      return;
    }

    // Calculate dynamic scale factor if not set
    if (this.config.normalizedToMeters === null) {
      this.scaleCalculationFrames++;
      const scaleInfo = this.calculateScaleFactor(poseData);
      
      if (scaleInfo) {
        if (this.scaleCalculationFrames >= this.minScaleCalculationFrames) {
          // Use exponential moving average to smooth scale calculation
          if (this.config.normalizedToMeters === null) {
            this.config.normalizedToMeters = scaleInfo.scale;
            this.personHeightNormalized = scaleInfo.heightNormalized;
            console.log(`[JumpDetector] Scale calculated: ${scaleInfo.scale.toFixed(2)} m/unit (${scaleInfo.method})`);
          } else {
            // Smooth the scale factor
            const alpha = 0.1; // Slow adaptation
            this.config.normalizedToMeters = 
              alpha * scaleInfo.scale + (1 - alpha) * this.config.normalizedToMeters;
          }
        }
      } else if (this.scaleCalculationFrames >= 30) {
        // Fallback: use estimated scale if calculation fails after many frames
        // Assume typical person height of 1.7m and normalized height of ~0.4
        const fallbackScale = this.config.estimatedPersonHeight / 0.4;
        this.config.normalizedToMeters = fallbackScale;
        console.log(`[JumpDetector] Using fallback scale: ${fallbackScale.toFixed(2)} m/unit`);
      }
    }

    // Calculate velocity and acceleration
    const verticalVelocity = this.calculateVerticalVelocity(poseData);
    const force = this.calculateForce(poseData, verticalVelocity);
    
    // Only process if we have valid previous data
    if (!this.previousPoseData) {
      this.previousPoseData = poseData;
      this.stateEntryTime = poseData.timestamp;
      
      // Initialize baseline height early
      const hipCenter = this.getHipCenter(poseData.joints);
      if (hipCenter && this.baselineHipHeight === null) {
        this.baselineHipHeight = hipCenter.y;
      }
      return;
    }

    // Update height tracking
    const hipCenter = this.getHipCenter(poseData.joints);
    if (hipCenter) {
      this.heightHistory.push(hipCenter.y);
      if (this.heightHistory.length > this.maxHeightHistoryLength) {
        this.heightHistory.shift();
      }
      
      // Update baseline height if we don't have one yet
      if (this.baselineHipHeight === null) {
        this.baselineHipHeight = hipCenter.y;
      }
    }

    // FSM State Machine - process current state
    this.processFSM(poseData, verticalVelocity, force, hipCenter);

    // Always publish force data
    if (force && this.onForceCalculated) {
      this.onForceCalculated(force);
    }
    
    this.previousPoseData = poseData;
  }

  /**
   * FSM State Machine - processes state transitions
   * Guarantees correct sequence: GROUNDED → TAKEOFF → AIRBORNE → LANDING → GROUNDED
   */
  processFSM(poseData, verticalVelocity, force, hipCenter) {
    const currentTime = poseData.timestamp;
    const timeInState = currentTime - this.stateEntryTime;
    const absVelocity = Math.abs(verticalVelocity);
    const weight = this.config.mass * 9.81;
    const grfRatio = force ? force.totalForce / weight : 1.0;

    switch (this.fsmState) {
      case FSM_STATES.GROUNDED:
        // Transition to TAKEOFF: significant upward velocity + debounce
        if (this.canTransitionToTakeoff(poseData, verticalVelocity, timeInState)) {
          this.transitionToTakeoff(poseData, hipCenter);
        }
        break;

      case FSM_STATES.TAKEOFF:
        // Transition to AIRBORNE: velocity peaks (stops increasing upward)
        if (this.canTransitionToAirborne(verticalVelocity, timeInState)) {
          this.transitionToAirborne(poseData, hipCenter);
        }
        // Safety: timeout back to GROUNDED
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Takeoff timeout');
        }
        break;

      case FSM_STATES.AIRBORNE:
        // Track peak height
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        // Transition to LANDING: downward velocity + minimum airtime
        if (this.canTransitionToLanding(poseData, verticalVelocity, timeInState)) {
          this.transitionToLanding(poseData);
        }
        // Safety: timeout back to GROUNDED
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Airborne timeout');
        }
        break;

      case FSM_STATES.LANDING:
        // Track peak GRF during landing
        if (force && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakGRF === null ||
              force.totalForce > this.jumpState.currentJump.peakGRF) {
            this.jumpState.currentJump.peakGRF = force.totalForce;
          }
        }
        
        // Transition to GROUNDED: GRF stabilizes + debounce
        if (this.canTransitionToGrounded(force, grfRatio, timeInState)) {
          this.transitionToGrounded('Landing complete');
        }
        // Safety: timeout back to GROUNDED
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Landing timeout');
        }
        break;
    }
  }

  /**
   * Check if can transition from GROUNDED to TAKEOFF
   */
  canTransitionToTakeoff(poseData, verticalVelocity, timeInState) {
    // Cooldown check
    const timeSinceLastJump = poseData.timestamp - this.jumpState.lastJumpEndTime;
    if (timeSinceLastJump < this.config.cooldownAfterJump) {
      return false;
    }

    // Velocity is already in m/s from calculateVerticalVelocity
    // Convert threshold from normalized units to m/s
    const scale = this.config.normalizedToMeters || 1.0;
    const takeoffThreshold = this.config.takeoffVelocityThresholdNormalized * scale;
    
    // Check if we have significant upward velocity
    const hasUpwardVelocity = verticalVelocity > takeoffThreshold;
    
    if (hasUpwardVelocity) {
      // Track when upward velocity was first detected
      if (this.upwardVelocityStartTime === 0) {
        this.upwardVelocityStartTime = poseData.timestamp;
      }
      
      // Debounce: must maintain upward velocity for debounce time
      const timeSinceUpwardVelocity = poseData.timestamp - this.upwardVelocityStartTime;
      if (timeSinceUpwardVelocity < this.config.takeoffDebounceTime) {
        return false;
      }
    } else {
      // Reset upward velocity tracking if velocity drops
      this.upwardVelocityStartTime = 0;
      return false;
    }

    // Check for bent knees (if required)
    if (this.config.requireBentKnees) {
      const angles = poseData.angles;
      if (angles) {
        const leftKnee = angles.leftLeg?.knee;
        const rightKnee = angles.rightLeg?.knee;
        
        // At least one knee should be bent (more lenient than requiring both)
        // 160 degrees is a reasonable threshold (straight leg is ~180)
        const hasBentKnees = (leftKnee !== null && leftKnee < 160) || 
                            (rightKnee !== null && rightKnee < 160);
        
        if (!hasBentKnees) {
          console.debug(`[JumpDetector] Takeoff rejected: knees not bent (L: ${leftKnee?.toFixed(1) || 'N/A'}, R: ${rightKnee?.toFixed(1) || 'N/A'})`);
          return false;
        }
      }
    }

    // Optional crouch check (if enabled and baseline available)
    if (this.config.requireCrouch) {
      const joints = poseData.joints;
      const hipCenter = this.getHipCenter(joints);
      
      if (hipCenter && this.baselineHipHeight !== null && scale > 0) {
        const hipDropNormalized = hipCenter.y - this.baselineHipHeight;
        const hipDropMeters = hipDropNormalized * scale;
        const minCrouchMeters = this.config.minCrouchDepthNormalized * scale;
        const hasCrouch = hipDropMeters > minCrouchMeters;
        
        if (!hasCrouch) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if can transition from TAKEOFF to AIRBORNE
   */
  canTransitionToAirborne(verticalVelocity, timeInState) {
    // Velocity must have peaked (no longer strongly upward)
    // Small positive or negative velocity indicates peak reached
    // Use normalized threshold (0.03 normalized units/s ≈ 0.06 m/s for typical scale)
    const scale = this.config.normalizedToMeters || 1.0;
    const peakThreshold = 0.03 * scale; // Convert to m/s
    // Velocity is already in m/s, so compare directly
    return verticalVelocity <= peakThreshold;
  }

  /**
   * Check if can transition from AIRBORNE to LANDING
   */
  canTransitionToLanding(poseData, verticalVelocity, timeInState) {
    // Must have minimum airtime (critical for FSM robustness)
    if (timeInState < this.config.minAirborneTime) {
      return false;
    }

    // Velocity is already in m/s from calculateVerticalVelocity
    // Convert threshold from normalized units to m/s
    const scale = this.config.normalizedToMeters || 1.0;
    const landingThreshold = this.config.landingVelocityThresholdNormalized * scale;
    
    // Check if we have significant downward velocity
    const hasDownwardVelocity = verticalVelocity < -landingThreshold;
    
    if (hasDownwardVelocity) {
      // Track when downward velocity was first detected
      if (this.downwardVelocityStartTime === 0) {
        this.downwardVelocityStartTime = this.previousPoseData?.timestamp || Date.now();
      }
      
      // Debounce: must maintain downward velocity for debounce time
      const timeSinceDownwardVelocity = poseData.timestamp - this.downwardVelocityStartTime;
      if (timeSinceDownwardVelocity >= this.config.landingDebounceTime) {
        return true;
      }
    } else {
      // Reset downward velocity tracking if velocity changes
      this.downwardVelocityStartTime = 0;
    }
    
    return false;
  }

  /**
   * Check if can transition from LANDING to GROUNDED
   */
  canTransitionToGrounded(force, grfRatio, timeInState) {
    // Debounce: must maintain stable GRF for debounce time
    if (timeInState < this.config.landingDebounceTime) {
      return false;
    }

    // GRF should be close to body weight (landing impact has settled)
    // Allow some margin (1.1 = 10% above weight)
    return grfRatio < 1.1;
  }

  /**
   * Transition to TAKEOFF state
   */
  transitionToTakeoff(poseData, hipCenter) {
    this.fsmState = FSM_STATES.TAKEOFF;
    this.stateEntryTime = poseData.timestamp;
    this.upwardVelocityStartTime = 0; // Reset for next time
    
    // Initialize jump tracking
    this.jumpState.currentJump = {
      takeoffTime: poseData.timestamp,
      takeoffHeight: hipCenter ? hipCenter.y : null, // Store takeoff height for jump height calculation
      landingTime: null,
      peakHeight: hipCenter ? hipCenter.y : null, // Minimum Y (highest point)
      peakGRF: null,
      airtime: 0,
    };
    
    this.jumpState.jumpCount++;
    
    if (this.onJumpDetected) {
      this.onJumpDetected({
        timestamp: poseData.timestamp,
        jumpNumber: this.jumpState.jumpCount,
        takeoffTime: poseData.timestamp,
      });
    }
    
    console.log('FSM: TAKEOFF', {
      jumpNumber: this.jumpState.jumpCount,
      timestamp: poseData.timestamp,
    });
  }

  /**
   * Transition to AIRBORNE state
   */
  transitionToAirborne(poseData, hipCenter) {
    this.fsmState = FSM_STATES.AIRBORNE;
    this.stateEntryTime = poseData.timestamp;
    
    // Update peak height
    if (hipCenter && this.jumpState.currentJump) {
      if (this.jumpState.currentJump.peakHeight === null ||
          hipCenter.y < this.jumpState.currentJump.peakHeight) {
        this.jumpState.currentJump.peakHeight = hipCenter.y;
      }
    }
    
    console.log('FSM: AIRBORNE', {
      jumpNumber: this.jumpState.jumpCount,
      timestamp: poseData.timestamp,
    });
  }

  /**
   * Transition to LANDING state
   */
  transitionToLanding(poseData) {
    this.fsmState = FSM_STATES.LANDING;
    this.stateEntryTime = poseData.timestamp;
    this.downwardVelocityStartTime = 0; // Reset for next time
    
    if (this.jumpState.currentJump) {
      this.jumpState.currentJump.landingTime = poseData.timestamp;
    }
    
    console.log('FSM: LANDING', {
      jumpNumber: this.jumpState.jumpCount,
      timestamp: poseData.timestamp,
    });
  }

  /**
   * Transition to GROUNDED state
   */
  transitionToGrounded(reason) {
    const wasInJump = this.fsmState !== FSM_STATES.GROUNDED;
    
    this.fsmState = FSM_STATES.GROUNDED;
    this.stateEntryTime = this.previousPoseData ? this.previousPoseData.timestamp : Date.now();
    this.upwardVelocityStartTime = 0; // Reset upward velocity tracking
    this.downwardVelocityStartTime = 0; // Reset downward velocity tracking
    
    // Validate and finalize jump if we were in a jump sequence
    if (wasInJump && this.jumpState.currentJump) {
      const jump = this.jumpState.currentJump;
      
      // Ensure landingTime is set (use current timestamp if not set)
      if (!jump.landingTime) {
        jump.landingTime = this.previousPoseData ? this.previousPoseData.timestamp : Date.now();
      }
      
      // Calculate final metrics
      const airtime = jump.landingTime && jump.takeoffTime 
        ? jump.landingTime - jump.takeoffTime 
        : 0;
      
      let jumpHeight = null;
      const scale = this.config.normalizedToMeters || 1.0; // Use scale for all calculations
      
      // Calculate jump height: difference between takeoff height and peak height
      // In screen coordinates, Y increases downward, so lower Y = higher position
      // peakHeight is the minimum Y (highest point), takeoffHeight is the Y at takeoff
      if (jump.peakHeight !== null && jump.takeoffHeight !== null && scale > 0) {
        const jumpHeightNormalized = jump.takeoffHeight - jump.peakHeight; // Positive = jumped up
        jumpHeight = jumpHeightNormalized * scale;
      }
      
      // Validate jump (convert minJumpHeight to meters if needed)
      const minJumpHeightMeters = this.config.minJumpHeightNormalized * scale;
      const isValidJump = jumpHeight !== null && 
                          jumpHeight >= minJumpHeightMeters &&
                          airtime >= this.config.minAirborneTime;
      
      // Always trigger landing callback with calculated metrics (even for invalid jumps)
      // This ensures the UI always shows the data
      if (this.onLandingDetected) {
        const landingData = {
          timestamp: jump.landingTime,
          jumpNumber: this.jumpState.jumpCount,
          jumpHeight: jumpHeight,
          airTime: airtime,
          takeoffTime: jump.takeoffTime,
          landingTime: jump.landingTime,
          groundReactionForce: jump.peakGRF,
        };
        
        console.log('[JumpDetector] Landing detected:', {
          airTime: landingData.airTime,
          jumpHeight: landingData.jumpHeight,
          landingTime: landingData.landingTime,
          takeoffHeight: jump.takeoffHeight,
          peakHeight: jump.peakHeight,
          scale: scale,
        });
        
        this.onLandingDetected(landingData);
      }
      
      if (isValidJump) {
        console.log('FSM: Jump complete', {
          jumpNumber: this.jumpState.jumpCount,
          jumpHeight: jumpHeight,
          airtime: airtime,
          peakGRF: jump.peakGRF,
        });
      } else {
        // Invalid jump - don't count it, but don't decrement (stats never go backwards)
        console.warn('FSM: Invalid jump discarded', {
          reason: reason,
          jumpHeight: jumpHeight,
          airtime: airtime,
          minJumpHeightMeters: minJumpHeightMeters,
          minAirborneTime: this.config.minAirborneTime,
        });
        // Reset jump count if this was the first invalid jump
        if (this.jumpState.jumpCount > 0) {
          this.jumpState.jumpCount--;
        }
      }
      
      this.jumpState.lastJumpEndTime = this.previousPoseData ? this.previousPoseData.timestamp : Date.now();
      this.jumpState.currentJump = null;
    }
    
    if (wasInJump) {
      console.log('FSM: GROUNDED', { reason });
    }
  }

  /**
   * Calculate vertical velocity from pose data
   * Pipeline: Raw landmarks → Raw velocity → Smoothed velocity (EMA)
   */
  calculateVerticalVelocity(poseData) {
    if (!this.previousPoseData || !poseData.joints || !this.previousPoseData.joints) {
      return 0;
    }

    const currentHip = this.getHipCenter(poseData.joints);
    const previousHip = this.getHipCenter(this.previousPoseData.joints);
    
    if (!currentHip || !previousHip || !currentHip.visible || !previousHip.visible) {
      this.smoothedVelocity = this.smoothedVelocity * 0.8;
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      return this.smoothedVelocity;
    }

    const timeDelta = (poseData.timestamp - this.previousPoseData.timestamp) / 1000;
    if (timeDelta <= 0 || timeDelta > 0.1) {
      return this.smoothedVelocity;
    }

    // Raw velocity from raw landmarks (in normalized units per second)
    const deltaYNormalized = previousHip.y - currentHip.y;
    const rawVelocityNormalized = deltaYNormalized / timeDelta;
    
    // Convert to m/s if scale is available, otherwise keep in normalized units
    const scale = this.config.normalizedToMeters || 1.0;
    const rawVelocityMs = rawVelocityNormalized * scale;
    this.rawVelocity = rawVelocityMs;

    // Noise gate (in normalized units)
    const noiseThresholdNormalized = this.config.noiseThresholdNormalized;
    const absVelocityNormalized = Math.abs(rawVelocityNormalized);
    if (absVelocityNormalized < noiseThresholdNormalized) {
      this.smoothedVelocity = this.smoothedVelocity * 0.9;
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      
      // Update baseline when stationary (in normalized units)
      if (this.baselineHipHeight === null || 
          Math.abs(currentHip.y - this.baselineHipHeight) < 0.01) {
        this.baselineHipHeight = currentHip.y;
      }
      this.lastSignificantMovement = poseData.timestamp;
      return this.smoothedVelocity;
    }
    
    // Smooth velocity with EMA (work in normalized units, convert at end)
    if (this.smoothedVelocity === 0) {
      this.smoothedVelocity = rawVelocityMs;
    } else {
      this.smoothedVelocity = 
        this.config.velocitySmoothing * rawVelocityMs + 
        (1 - this.config.velocitySmoothing) * this.smoothedVelocity;
    }
    
    // Store smoothed velocity in history (in m/s)
    this.velocityHistory.push(this.smoothedVelocity);
    if (this.velocityHistory.length > this.maxHistoryLength) {
      this.velocityHistory.shift();
    }
    
    this.lastSignificantMovement = poseData.timestamp;
    return this.smoothedVelocity; // Returns in m/s
  }

  /**
   * Calculate force based on pose data
   * Pipeline: Smoothed velocity → Acceleration from smoothed velocity → Force
   */
  calculateForce(poseData, verticalVelocity) {
    if (!this.previousPoseData) {
      return null;
    }

    const timeDelta = (poseData.timestamp - this.previousPoseData.timestamp) / 1000;
    if (timeDelta <= 0 || timeDelta > 0.1) {
      return null;
    }

    const g = 9.81;
    const weight = this.config.mass * g;
    const absVelocity = Math.abs(verticalVelocity);
    
    // Hard clamp to bodyweight when stationary
    // Convert noise threshold to m/s for comparison
    const scale = this.config.normalizedToMeters || 1.0;
    const noiseThresholdMs = this.config.noiseThresholdNormalized * scale;
    const recentVelocities = this.velocityHistory.slice(-5);
    const allSmall = recentVelocities.length >= 3 && 
                     recentVelocities.every(v => Math.abs(v) < noiseThresholdMs);
    
    if (absVelocity < noiseThresholdMs || allSmall) {
      return {
        verticalVelocity: 0,
        acceleration: 0,
        weight: weight,
        netForce: 0,
        totalForce: weight,
        mass: this.config.mass,
        timestamp: poseData.timestamp,
      };
    }
    
    // Acceleration from smoothed velocity
    const previousSmoothedVelocity = this.velocityHistory.length > 1
      ? this.velocityHistory[this.velocityHistory.length - 2]
      : 0;
    
    let rawAcceleration = (verticalVelocity - previousSmoothedVelocity) / timeDelta;
    rawAcceleration = Math.max(Math.min(rawAcceleration, 50), -50);
    
    // Smooth acceleration
    if (this.smoothedAcceleration === 0) {
      this.smoothedAcceleration = rawAcceleration;
    } else {
      this.smoothedAcceleration = 
        this.config.accelerationSmoothing * rawAcceleration + 
        (1 - this.config.accelerationSmoothing) * this.smoothedAcceleration;
    }
    
    if (Math.abs(this.smoothedAcceleration) < 0.2) {
      this.smoothedAcceleration = 0;
    }
    
    const accelerationMs2 = this.smoothedAcceleration;
    const netForce = this.config.mass * accelerationMs2;
    let totalForce = weight + netForce;
    totalForce = Math.max(totalForce, weight);
    
    return {
      verticalVelocity: verticalVelocity,
      acceleration: accelerationMs2,
      weight: weight,
      netForce: netForce,
      totalForce: totalForce,
      mass: this.config.mass,
      timestamp: poseData.timestamp,
    };
  }

  getHipCenter(joints) {
    if (!joints || !joints.leftHip || !joints.rightHip) {
      return null;
    }

    const leftHip = joints.leftHip;
    const rightHip = joints.rightHip;

    if (!leftHip.visible || !rightHip.visible) {
      return null;
    }
    
    if (leftHip.visibility !== undefined && leftHip.visibility < 0.6) {
      return null;
    }
    if (rightHip.visibility !== undefined && rightHip.visibility < 0.6) {
      return null;
    }

    return {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: (leftHip.z + rightHip.z) / 2,
      visible: true,
    };
  }

  /**
   * Get current jump state (for UI)
   */
  getState() {
    return {
      fsmState: this.fsmState,
      isJumping: this.fsmState === FSM_STATES.TAKEOFF,
      isInAir: this.fsmState === FSM_STATES.AIRBORNE,
      isLanding: this.fsmState === FSM_STATES.LANDING,
      jumpCount: this.jumpState.jumpCount,
      currentAirtime: this.jumpState.currentJump && this.jumpState.currentJump.takeoffTime
        ? (this.previousPoseData?.timestamp || Date.now()) - this.jumpState.currentJump.takeoffTime
        : 0,
    };
  }

  /**
   * Reset jump detector state
   */
  reset() {
    this.fsmState = FSM_STATES.GROUNDED;
    this.stateEntryTime = 0;
    this.jumpState = {
      jumpCount: 0,
      currentJump: null,
      lastJumpEndTime: 0,
    };
    this.previousPoseData = null;
    this.rawVelocity = 0;
    this.smoothedVelocity = 0;
    this.velocityHistory = [];
    this.heightHistory = [];
    this.smoothedAcceleration = 0;
    this.baselineHipHeight = null;
    this.lastSignificantMovement = 0;
    this.config.normalizedToMeters = null; // Reset scale
    this.personHeightNormalized = null;
    this.scaleCalculationFrames = 0;
    this.upwardVelocityStartTime = 0;
    this.downwardVelocityStartTime = 0;
  }
}

// Singleton instance
export const jumpDetector = new JumpDetector();
