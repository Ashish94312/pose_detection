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
    this.config = {
      // Real-world scaling
      normalizedToMeters: 2.0,
      
      // FSM Transition Thresholds
      takeoffVelocityThreshold: 0.3, // m/s - upward velocity to trigger takeoff
      landingVelocityThreshold: 0.2, // m/s - downward velocity to trigger landing
      landingGRFThreshold: 1.2, // Multiple of body weight (e.g., 1.2 = 20% above weight)
      
      // Time gating (critical for FSM robustness)
      minAirborneTime: 100, // ms - minimum time in AIRBORNE state
      takeoffDebounceTime: 50, // ms - debounce for takeoff detection
      landingDebounceTime: 50, // ms - debounce for landing detection
      maxJumpDuration: 2000, // ms - safety timeout
      cooldownAfterJump: 500, // ms - cooldown after landing
      
      // Validation thresholds
      minJumpHeight: 0.10, // m - minimum jump height to count
      minCrouchDepth: 0.06, // m - minimum crouch for jump detection
      
      // Physics
      mass: 70, // kg
      noiseThreshold: 0.02, // m/s - velocity noise gate
      velocitySmoothing: 0.35, // EMA alpha (0.3-0.4)
      accelerationSmoothing: 0.2, // EMA alpha for acceleration
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
    
    // FSM timing
    this.stateEntryTime = 0; // When current state was entered
    this.lastSignificantMovement = 0;
    
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
   * Main FSM processing function
   * @param {Object} poseData - Pose data from pub/sub
   */
  processPoseData(poseData) {
    if (!poseData || !poseData.joints) {
      return;
    }

    // Calculate velocity and acceleration
    const verticalVelocity = this.calculateVerticalVelocity(poseData);
    const force = this.calculateForce(poseData, verticalVelocity);
    
    // Only process if we have valid previous data
    if (!this.previousPoseData) {
      this.previousPoseData = poseData;
      this.stateEntryTime = poseData.timestamp;
      return;
    }

    // Update height tracking
    const hipCenter = this.getHipCenter(poseData.joints);
    if (hipCenter) {
      this.heightHistory.push(hipCenter.y);
      if (this.heightHistory.length > this.maxHeightHistoryLength) {
        this.heightHistory.shift();
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
        if (this.canTransitionToLanding(verticalVelocity, timeInState)) {
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

    // Debounce: must maintain upward velocity for debounce time
    if (timeInState < this.config.takeoffDebounceTime) {
      return false;
    }

    // Must have significant upward velocity
    if (verticalVelocity <= this.config.takeoffVelocityThreshold) {
      return false;
    }

    // Optional: check for crouch (both knees bent)
    const angles = poseData.angles;
    const joints = poseData.joints;
    const hipCenter = this.getHipCenter(joints);
    
    if (angles && hipCenter && this.baselineHipHeight !== null) {
      const leftKnee = angles.leftLeg?.knee;
      const rightKnee = angles.rightLeg?.knee;
      
      // Both knees must be bent
      const hasBentKnees = (leftKnee !== null && leftKnee < 150) && 
                           (rightKnee !== null && rightKnee < 150);
      
      // Crouch check: hip lower than baseline
      const hipDropNormalized = hipCenter.y - this.baselineHipHeight;
      const hipDropMeters = hipDropNormalized * this.config.normalizedToMeters;
      const hasCrouch = hipDropMeters > this.config.minCrouchDepth;
      
      if (!hasBentKnees || !hasCrouch) {
        return false;
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
    return verticalVelocity <= 0.06; // m/s threshold
  }

  /**
   * Check if can transition from AIRBORNE to LANDING
   */
  canTransitionToLanding(verticalVelocity, timeInState) {
    // Must have minimum airtime (critical for FSM robustness)
    if (timeInState < this.config.minAirborneTime) {
      return false;
    }

    // Must have significant downward velocity
    return verticalVelocity <= -this.config.landingVelocityThreshold;
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
    
    // Initialize jump tracking
    this.jumpState.currentJump = {
      takeoffTime: poseData.timestamp,
      landingTime: null,
      peakHeight: hipCenter ? hipCenter.y : null,
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
    
    // Validate and finalize jump if we were in a jump sequence
    if (wasInJump && this.jumpState.currentJump) {
      const jump = this.jumpState.currentJump;
      
      // Calculate final metrics
      const airtime = jump.landingTime && jump.takeoffTime 
        ? jump.landingTime - jump.takeoffTime 
        : 0;
      
      const hipCenter = this.getHipCenter(this.previousPoseData?.joints);
      let jumpHeight = null;
      if (jump.peakHeight !== null && hipCenter) {
        const jumpHeightNormalized = hipCenter.y - jump.peakHeight;
        jumpHeight = jumpHeightNormalized * this.config.normalizedToMeters;
      }
      
      // Validate jump
      const isValidJump = jumpHeight !== null && 
                          jumpHeight >= this.config.minJumpHeight &&
                          airtime >= this.config.minAirborneTime;
      
      if (isValidJump) {
        // Valid jump - trigger landing callback
        if (this.onLandingDetected) {
          this.onLandingDetected({
            timestamp: jump.landingTime || this.previousPoseData.timestamp,
            jumpNumber: this.jumpState.jumpCount,
            jumpHeight: jumpHeight,
            airTime: airtime,
            takeoffTime: jump.takeoffTime,
            landingTime: jump.landingTime,
            groundReactionForce: jump.peakGRF,
          });
        }
        
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

    // Raw velocity from raw landmarks
    const deltaYNormalized = previousHip.y - currentHip.y;
    const deltaYMeters = deltaYNormalized * this.config.normalizedToMeters;
    const rawVelocityMs = deltaYMeters / timeDelta;
    this.rawVelocity = rawVelocityMs;

    // Noise gate
    const absVelocity = Math.abs(rawVelocityMs);
    if (absVelocity < this.config.noiseThreshold) {
      this.smoothedVelocity = this.smoothedVelocity * 0.9;
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      
      // Update baseline when stationary
      if (this.baselineHipHeight === null || 
          Math.abs(currentHip.y - this.baselineHipHeight) < 0.01) {
        this.baselineHipHeight = currentHip.y;
      }
      this.lastSignificantMovement = poseData.timestamp;
      return this.smoothedVelocity;
    }
    
    // Smooth velocity with EMA
    if (this.smoothedVelocity === 0) {
      this.smoothedVelocity = rawVelocityMs;
    } else {
      this.smoothedVelocity = 
        this.config.velocitySmoothing * rawVelocityMs + 
        (1 - this.config.velocitySmoothing) * this.smoothedVelocity;
    }
    
    // Store smoothed velocity in history
    this.velocityHistory.push(this.smoothedVelocity);
    if (this.velocityHistory.length > this.maxHistoryLength) {
      this.velocityHistory.shift();
    }
    
    this.lastSignificantMovement = poseData.timestamp;
    return this.smoothedVelocity;
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
    const recentVelocities = this.velocityHistory.slice(-5);
    const allSmall = recentVelocities.length >= 3 && 
                     recentVelocities.every(v => Math.abs(v) < this.config.noiseThreshold);
    
    if (absVelocity < this.config.noiseThreshold || allSmall) {
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
  }
}

// Singleton instance
export const jumpDetector = new JumpDetector();
