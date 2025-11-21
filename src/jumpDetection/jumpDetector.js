/**
 * Jump Detection Module - Clean Air-Time FSM (4 States)
 * Detects jumps using pure kinematics - no knee-angle checks, no crouch checks
 * 
 * FSM States: GROUNDED → TAKEOFF → AIRBORNE → LANDING → GROUNDED
 * 
 * Key Detection Method:
 * - Uses RELATIVE ANKLE HEIGHT to detect feet leaving ground
 * - baselineFootY = average ankle Y when stationary
 * - currentFootY < baselineFootY - 0.015 = feet off ground
 * 
 * Jump Conditions:
 * 1. Both feet must rise (ankleLeft.y < baseline - 0.015 AND ankleRight.y < baseline - 0.015)
 * 2. Vertical velocity > 0.25 m/s
 * 3. Minimum airtime > 120ms
 * 
 * This eliminates:
 * - One-leg lifts
 * - Squatting
 * - Bouncing
 * - Noise from camera shake
 */

import { posePubSub } from '../utils/pubsub';
import { performanceProfiler } from '../utils/performanceProfiler';

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
      recentJumpTimes: [], // Track recent jump times for adaptive cooldown
    };
    
    // Configuration - Clean Air-Time FSM
    this.config = {
      // Real-world scaling - will be calculated dynamically from person height
      normalizedToMeters: null, // Will be calculated dynamically
      estimatedPersonHeight: 1.7, // meters - average adult height
      
      // FSM Transition Thresholds - GAME MODE: Lower thresholds for instant response
      takeoffVelocityThreshold: 0.15, // m/s - lower threshold for faster detection (was 0.25)
      landingVelocityThreshold: 0.10, // m/s - lower threshold for faster landing detection (was 0.15)
      smallPositiveVelocityThreshold: 0.05, // m/s - faster transition to AIRBORNE (was 0.1)
      
      // Ankle height detection - Balance between sensitivity and accuracy
      ankleRiseThreshold: 0.015, // normalized units - ensures both feet are clearly off ground (prevents false positives)
      
      // Time gating - GAME MODE: Faster transitions, minimal delays
      minAirborneTime: 80, // ms - reduced minimum airtime for faster detection (was 120)
      velocityPositiveDuration: 20, // ms - faster debounce for instant response (was 40)
      hipVelocityStableDuration: 20, // ms - faster landing detection (was 40)
      maxJumpDuration: 2000, // ms - safety timeout
      cooldownAfterJump: 0, // ms - ZERO cooldown for instant continuous jumping (was 150)
      rapidJumpCooldown: 0, // ms - ZERO cooldown for rapid jumps (was 50)
      
      // Validation thresholds - GAME MODE: Lower threshold to catch all jumps
      minJumpHeightNormalized: 0.03, // normalized units - lower threshold to catch small jumps (was 0.05)
      
      // Physics - GAME MODE: More responsive, less smoothing
      mass: 70, // kg
      noiseThresholdNormalized: 0.008, // normalized units/s - lower noise gate for sensitivity (was 0.01)
      velocitySmoothing: 0.5, // EMA alpha - higher = more responsive, less lag (was 0.35)
      accelerationSmoothing: 0.3, // EMA alpha - more responsive acceleration (was 0.2)
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
    
    // Ankle height tracking for feet-off-ground detection
    this.baselineAnkleY = null; // Average ankle Y when stationary
    this.ankleYHistory = []; // History of ankle Y positions for baseline calculation
    this.maxAnkleHistoryLength = 20;
    
    // Warm-up period to prevent false positives when person enters frame
    this.warmupFrames = 0; // Count frames with both ankles visible
    this.minWarmupFrames = 30; // Need at least 30 frames (0.5s at 60fps) before allowing jumps
    this.bothAnklesVisibleHistory = []; // Track if both ankles were visible in previous frames
    this.minStableBaselineFrames = 10; // Need stable baseline for this many frames before allowing jumps
    
    // Dynamic scale calculation
    this.personHeightNormalized = null; // Person's height in normalized coordinates
    this.scaleCalculationFrames = 0;
    this.minScaleCalculationFrames = 10; // Need at least 10 frames to calculate scale
    
    // FSM timing
    this.stateEntryTime = 0; // When current state was entered
    this.lastSignificantMovement = 0;
    this.upwardVelocityStartTime = 0; // When upward velocity was first detected (for debounce)
    this.downwardVelocityStartTime = 0; // When downward velocity was first detected (for debounce)
    this.hipVelocityStableStartTime = 0; // When hip velocity became stable (for LANDING → GROUNDED)
    
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
      // Debug: Log when pose data is received
      if (process.env.NODE_ENV === 'development' && !this.previousPoseData) {
        console.log('[JumpDetector] First pose data received', {
          hasJoints: !!poseData?.joints,
          jointsCount: poseData?.joints ? Object.keys(poseData.joints).length : 0,
          hasAngles: !!poseData?.angles,
          timestamp: poseData?.timestamp,
        });
      }
      this.processPoseData(poseData);
    });

    this.isSubscribed = true;
    const subscriberCount = posePubSub.getSubscriberCount();
    console.log(`[JumpDetector] Subscribed to pose data feed (total subscribers: ${subscriberCount})`);
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
   * Works with both MoveNet (lower visibility) and BlazePose (higher visibility)
   */
  calculateScaleFactor(poseData) {
    if (!poseData || !poseData.joints) {
      return null;
    }

    const joints = poseData.joints;
    
    // Determine if we're using MoveNet by checking visibility scores
    // MoveNet typically has lower confidence scores (< 0.7), BlazePose has higher (> 0.7)
    const checkVisibility = (joint) => {
      if (!joint || !joint.visible) return false;
      const visibility = joint.visibility !== undefined ? joint.visibility : 1.0;
      // For MoveNet, use lower threshold (0.25), for BlazePose use higher (0.5)
      return visibility >= (visibility < 0.7 ? 0.25 : 0.5);
    };
    
    // Method 1: Use head (nose) to ankle distance
    if (joints.nose && joints.leftAnkle && joints.rightAnkle) {
      const nose = joints.nose;
      const leftAnkle = joints.leftAnkle;
      const rightAnkle = joints.rightAnkle;
      
      if (checkVisibility(nose) && (checkVisibility(leftAnkle) || checkVisibility(rightAnkle))) {
        const ankleY = checkVisibility(leftAnkle) && checkVisibility(rightAnkle)
          ? (leftAnkle.y + rightAnkle.y) / 2
          : (checkVisibility(leftAnkle) ? leftAnkle.y : rightAnkle.y);
        
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
      
      if (checkVisibility(leftShoulder) && checkVisibility(rightShoulder) && 
          checkVisibility(leftHip) && checkVisibility(rightHip)) {
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
   * Get ankle positions (left and right)
   * Returns average Y position if both visible, or single if only one visible
   */
  getAnkleY(joints) {
    if (!joints) return null;
    
    const leftAnkle = joints.leftAnkle;
    const rightAnkle = joints.rightAnkle;
    
    if (!leftAnkle || !rightAnkle) return null;
    
    // Check visibility
    const leftVisible = leftAnkle.visible && 
                       (leftAnkle.visibility === undefined || leftAnkle.visibility >= 0.6);
    const rightVisible = rightAnkle.visible && 
                        (rightAnkle.visibility === undefined || rightAnkle.visibility >= 0.6);
    
    if (leftVisible && rightVisible) {
      return {
        left: leftAnkle.y,
        right: rightAnkle.y,
        average: (leftAnkle.y + rightAnkle.y) / 2,
        bothVisible: true
      };
    } else if (leftVisible) {
      return {
        left: leftAnkle.y,
        right: null,
        average: leftAnkle.y,
        bothVisible: false
      };
    } else if (rightVisible) {
      return {
        left: null,
        right: rightAnkle.y,
        average: rightAnkle.y,
        bothVisible: false
      };
    }
    
    return null;
  }

  /**
   * Check if both feet are off the ground using relative ankle height
   * STRICT: Both feet must be clearly off ground - prevents single leg lifts from counting
   * Also prevents false positives when person first enters frame
   */
  bothFeetAreOffGround(joints) {
    if (!joints || this.baselineAnkleY === null) {
      return false;
    }
    
    const ankleData = this.getAnkleY(joints);
    // STRICT: Both ankles must be visible and detected
    if (!ankleData || !ankleData.bothVisible) {
      return false;
    }
    
    // WARM-UP CHECK: Prevent false positives when person first enters frame
    // Need to see both ankles consistently before allowing jump detection
    if (this.warmupFrames < this.minWarmupFrames) {
      return false; // Still in warm-up period
    }
    
    // STABILITY CHECK: Need stable baseline before allowing jumps
    // This prevents false positives when baseline is first being established
    if (this.ankleYHistory.length < this.minStableBaselineFrames) {
      return false; // Baseline not stable enough yet
    }
    
    // Both ankles must be clearly above baseline (lower Y = higher position)
    // Use the threshold to ensure both feet are significantly off ground
    const leftOffGround = ankleData.left < (this.baselineAnkleY - this.config.ankleRiseThreshold);
    const rightOffGround = ankleData.right < (this.baselineAnkleY - this.config.ankleRiseThreshold);
    
    // STRICT: BOTH feet must be off ground - no exceptions
    // This prevents single leg lifts, leg raises, or one-foot movements from counting as jumps
    return leftOffGround && rightOffGround;
  }

  /**
   * Check if feet are touching the ground
   */
  feetTouchingGround(joints) {
    if (!joints || this.baselineAnkleY === null) {
      return false;
    }
    
    const ankleData = this.getAnkleY(joints);
    if (!ankleData) {
      return false;
    }
    
    // At least one ankle should be close to baseline (within threshold)
    const threshold = this.config.ankleRiseThreshold;
    if (ankleData.bothVisible) {
      const leftNearGround = Math.abs(ankleData.left - this.baselineAnkleY) < threshold;
      const rightNearGround = Math.abs(ankleData.right - this.baselineAnkleY) < threshold;
      return leftNearGround || rightNearGround;
    } else if (ankleData.average !== null) {
      return Math.abs(ankleData.average - this.baselineAnkleY) < threshold;
    }
    
    return false;
  }

  /**
   * Update baseline ankle height when stationary
   * Also tracks warm-up period to prevent false positives when person enters frame
   */
  updateBaselineAnkleHeight(joints, verticalVelocity) {
    const ankleData = this.getAnkleY(joints);
    
    // Track warm-up: count consecutive frames with both ankles visible
    if (ankleData && ankleData.bothVisible) {
      this.bothAnklesVisibleHistory.push(true);
      // Keep only recent history (last 60 frames = ~1 second at 60fps)
      if (this.bothAnklesVisibleHistory.length > 60) {
        this.bothAnklesVisibleHistory.shift();
      }
      
      // Count warm-up frames (consecutive frames with both ankles visible)
      // Reset if we lose visibility
      if (this.bothAnklesVisibleHistory.length >= this.minWarmupFrames) {
        // Check if we have enough consecutive visible frames
        const recentVisible = this.bothAnklesVisibleHistory.slice(-this.minWarmupFrames);
        if (recentVisible.every(v => v === true)) {
          this.warmupFrames = this.minWarmupFrames;
        } else {
          // Reset warm-up if we had gaps
          this.warmupFrames = recentVisible.filter(v => v === true).length;
        }
      } else {
        this.warmupFrames = this.bothAnklesVisibleHistory.length;
      }
    } else {
      // Reset warm-up if both ankles not visible
      this.bothAnklesVisibleHistory.push(false);
      if (this.bothAnklesVisibleHistory.length > 60) {
        this.bothAnklesVisibleHistory.shift();
      }
      // Reset warm-up counter if we lose visibility
      if (this.bothAnklesVisibleHistory.slice(-5).every(v => v === false)) {
        this.warmupFrames = 0;
      }
    }
    
    if (!ankleData || !ankleData.bothVisible) {
      return;
    }
    
    // Only update baseline when velocity is near zero (stationary)
    const absVelocity = Math.abs(verticalVelocity);
    const noiseThreshold = this.config.noiseThresholdNormalized * (this.config.normalizedToMeters || 1.0);
    
    if (absVelocity < noiseThreshold) {
      this.ankleYHistory.push(ankleData.average);
      if (this.ankleYHistory.length > this.maxAnkleHistoryLength) {
        this.ankleYHistory.shift();
      }
      
      // Calculate baseline as average of recent stationary positions
      // Need at least minStableBaselineFrames for stable baseline
      if (this.ankleYHistory.length >= this.minStableBaselineFrames) {
        const sum = this.ankleYHistory.reduce((a, b) => a + b, 0);
        this.baselineAnkleY = sum / this.ankleYHistory.length;
      } else if (this.baselineAnkleY === null && this.ankleYHistory.length >= 5) {
        // Initialize with average of available history (need at least 5 frames)
        const sum = this.ankleYHistory.reduce((a, b) => a + b, 0);
        this.baselineAnkleY = sum / this.ankleYHistory.length;
      }
    }
  }

  /**
   * Main FSM processing function
   * @param {Object} poseData - Pose data from pub/sub
   */
  processPoseData(poseData) {
    const timerId = performanceProfiler.start('jumpDetector.processPoseData');
    
    if (!poseData || !poseData.joints) {
      if (timerId) performanceProfiler.end(timerId, { skipped: true });
      // Debug: Log why pose data was skipped
      if (process.env.NODE_ENV === 'development' && !this.previousPoseData) {
        console.warn('[JumpDetector] Skipped pose data - missing joints', {
          hasPoseData: !!poseData,
          hasJoints: !!poseData?.joints,
          poseDataKeys: poseData ? Object.keys(poseData) : [],
        });
      }
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
      
      // Initialize baseline heights
      const hipCenter = this.getHipCenter(poseData.joints);
      if (hipCenter && this.baselineHipHeight === null) {
        this.baselineHipHeight = hipCenter.y;
      }
      
      // Initialize baseline ankle height
      this.updateBaselineAnkleHeight(poseData.joints, verticalVelocity);
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

    // Update baseline ankle height when stationary (only in GROUNDED state)
    if (this.fsmState === FSM_STATES.GROUNDED) {
      this.updateBaselineAnkleHeight(poseData.joints, verticalVelocity);
    }

    // FSM State Machine - process current state
    this.processFSM(poseData, verticalVelocity, force, hipCenter);

    // Always publish force data
    if (force && this.onForceCalculated) {
      this.onForceCalculated(force);
    }
    
    this.previousPoseData = poseData;
    
    if (timerId) performanceProfiler.end(timerId, { fsmState: this.fsmState });
  }

  /**
   * FSM State Machine - processes state transitions
   * Clean 4-state FSM: GROUNDED → TAKEOFF → AIRBORNE → LANDING → GROUNDED
   */
  processFSM(poseData, verticalVelocity, force, hipCenter) {
    const timerId = performanceProfiler.start('jumpDetector.processFSM', { state: this.fsmState });
    const currentTime = poseData.timestamp;
    const timeInState = currentTime - this.stateEntryTime;

    switch (this.fsmState) {
      case FSM_STATES.GROUNDED:
        // Transition to TAKEOFF: upward velocity + both feet off ground + velocity stayed positive
        if (this.canTransitionToTakeoff(poseData, verticalVelocity, timeInState)) {
          this.transitionToTakeoff(poseData, hipCenter);
        }
        break;

      case FSM_STATES.TAKEOFF:
        // Track peak height during takeoff (in case we reach peak early)
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        // Transition to AIRBORNE: feet off ground + hip velocity small positive
        if (this.canTransitionToAirborne(poseData, verticalVelocity, timeInState)) {
          this.transitionToAirborne(poseData, hipCenter);
        }
        // Safety: timeout back to GROUNDED
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Takeoff timeout');
        }
        break;

      case FSM_STATES.AIRBORNE:
        // Track peak height (minimum Y = highest point)
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        // Transition to LANDING: downward velocity + feet touching ground + minimum airtime
        if (this.canTransitionToLanding(poseData, verticalVelocity, timeInState)) {
          this.transitionToLanding(poseData);
        }
        // Safety: timeout back to GROUNDED
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Airborne timeout');
        }
        break;

      case FSM_STATES.LANDING:
        // Track peak height during landing (in case we haven't reached peak yet)
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        // Track peak GRF during landing
        if (force && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakGRF === null ||
              force.totalForce > this.jumpState.currentJump.peakGRF) {
            this.jumpState.currentJump.peakGRF = force.totalForce;
          }
        }
        
        // Transition to GROUNDED: hip velocity stable for duration
        if (this.canTransitionToGrounded(poseData, verticalVelocity, timeInState)) {
          this.transitionToGrounded('Landing complete');
        }
        // Safety: timeout back to GROUNDED
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Landing timeout');
        }
        break;
    }
    
    if (timerId) performanceProfiler.end(timerId, { state: this.fsmState });
  }

  /**
   * Check if can transition from GROUNDED to TAKEOFF
   * GAME MODE: Instant detection, no cooldown, but BOTH feet must be off ground
   * Conditions:
   * 1. upwardVelocity > takeoffThreshold (lowered for faster detection)
   * 2. bothFeetAreOffGround() - REQUIRED: both feet must be off ground (no single leg lifts)
   * 3. velocityStayedPositiveFor(reduced duration for instant response)
   * 4. Warm-up period completed - prevents false positives when person enters frame
   */
  canTransitionToTakeoff(poseData, verticalVelocity, timeInState) {
    // WARM-UP CHECK: Prevent false positives when person first enters frame
    // Need to see both ankles consistently for warm-up period before allowing jumps
    if (this.warmupFrames < this.minWarmupFrames) {
      return false; // Still in warm-up period - don't allow jumps yet
    }
    
    // BASELINE STABILITY CHECK: Need stable baseline before allowing jumps
    if (!this.baselineAnkleY || this.ankleYHistory.length < this.minStableBaselineFrames) {
      return false; // Baseline not stable enough yet
    }
    
    // GAME MODE: Zero cooldown - allow instant consecutive jumps
    // Only prevent if we're still in a jump sequence (safety check)
    const timeSinceLastJump = poseData.timestamp - this.jumpState.lastJumpEndTime;
    if (timeSinceLastJump < 50 && this.jumpState.currentJump !== null) {
      // Only block if we're still processing the previous jump (safety)
      return false;
    }

    // Condition 1: Check upward velocity threshold
    const hasUpwardVelocity = verticalVelocity > this.config.takeoffVelocityThreshold;
    
    if (hasUpwardVelocity) {
      // Track when upward velocity was first detected
      if (this.upwardVelocityStartTime === 0) {
        this.upwardVelocityStartTime = poseData.timestamp;
      }
      
      // Condition 3: Velocity must stay positive for required duration
      const timeSinceUpwardVelocity = poseData.timestamp - this.upwardVelocityStartTime;
      if (timeSinceUpwardVelocity < this.config.velocityPositiveDuration) {
        return false;
      }
    } else {
      // Reset upward velocity tracking if velocity drops
      this.upwardVelocityStartTime = 0;
      return false;
    }

    // Condition 2: BOTH feet must be off ground - this prevents single leg lifts from counting as jumps
    // This is critical for accurate jump detection - a real jump requires both feet to leave the ground
    if (!this.bothFeetAreOffGround(poseData.joints)) {
      return false;
    }

    return true;
  }

  /**
   * Check if can transition from TAKEOFF to AIRBORNE
   * Conditions:
   * 1. feetDetectedOffGround() (both feet still off ground)
   * 2. hipVelocity < smallPositiveThreshold (velocity has peaked)
   */
  canTransitionToAirborne(poseData, verticalVelocity, timeInState) {
    // Condition 1: Feet must still be off ground
    if (!this.bothFeetAreOffGround(poseData.joints)) {
      return false;
    }
    
    // Condition 2: Hip velocity must be small positive (velocity has peaked)
    // Velocity is already in m/s
    return verticalVelocity <= this.config.smallPositiveVelocityThreshold;
  }

  /**
   * Check if can transition from AIRBORNE to LANDING
   * GAME MODE: Faster landing detection for instant response
   * Conditions:
   * 1. verticalVelocity < -landingThreshold (downward velocity)
   * 2. feetTouchingGround() OR approaching ground (early prediction)
   * 3. airtime > reduced minimum (faster detection)
   */
  canTransitionToLanding(poseData, verticalVelocity, timeInState) {
    // GAME MODE: Reduced minimum airtime for faster detection
    // Allow landing detection as soon as physically possible
    if (timeInState < this.config.minAirborneTime) {
      return false;
    }

    // Condition 1: Check downward velocity threshold
    const hasDownwardVelocity = verticalVelocity < -this.config.landingVelocityThreshold;
    
    if (!hasDownwardVelocity) {
      return false;
    }

    // Condition 2: Feet must be touching ground
    if (!this.feetTouchingGround(poseData.joints)) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if can transition from LANDING to GROUNDED
   * GAME MODE: Faster transition for instant next jump detection
   * Condition: hipVelocity becomes stable for reduced duration
   */
  canTransitionToGrounded(poseData, verticalVelocity, timeInState) {
    // GAME MODE: More lenient stability check for faster detection
    const absVelocity = Math.abs(verticalVelocity);
    const noiseThreshold = this.config.noiseThresholdNormalized * (this.config.normalizedToMeters || 1.0);
    
    // GAME MODE: Allow transition with slightly higher velocity (more lenient)
    const stabilityThreshold = noiseThreshold * 1.5; // 50% more lenient
    
    if (absVelocity < stabilityThreshold) {
      // Track when velocity became stable
      if (this.hipVelocityStableStartTime === 0) {
        this.hipVelocityStableStartTime = poseData.timestamp;
      }
      
      // GAME MODE: Reduced stable duration for instant next jump
      const timeSinceStable = poseData.timestamp - this.hipVelocityStableStartTime;
      return timeSinceStable >= this.config.hipVelocityStableDuration;
    } else {
      // Reset stable tracking if velocity changes
      this.hipVelocityStableStartTime = 0;
      return false;
    }
  }

  /**
   * Transition to TAKEOFF state
   */
  transitionToTakeoff(poseData, hipCenter) {
    const jumpDetectionStartTime = performance.now(); // High-resolution timing
    const jumpDetectionStartTimestamp = Date.now(); // Standard timestamp
    
    this.fsmState = FSM_STATES.TAKEOFF;
    this.stateEntryTime = poseData.timestamp;
    
    // Initialize jump tracking
    // Note: jumpCount is NOT incremented here - it will be incremented only when jump is validated
    this.jumpState.currentJump = {
      takeoffTime: poseData.timestamp,
      takeoffHeight: hipCenter ? hipCenter.y : null, // Store takeoff height for jump height calculation
      landingTime: null,
      peakHeight: hipCenter ? hipCenter.y : null, // Minimum Y (highest point)
      peakGRF: null,
      airtime: 0,
      pendingJumpNumber: this.jumpState.jumpCount + 1, // Track what the jump number would be if validated
      jumpDetectionStartTime: jumpDetectionStartTime, // Store for execution time calculation
      jumpDetectionStartTimestamp: jumpDetectionStartTimestamp, // Store for execution time calculation
    };
    
    if (this.onJumpDetected) {
      // Note: jumpNumber here is pending - the actual count will be set when jump is validated
      this.onJumpDetected({
        timestamp: poseData.timestamp,
        jumpNumber: this.jumpState.currentJump.pendingJumpNumber,
        takeoffTime: poseData.timestamp,
      });
    }
    
    console.log('🚀 FSM: TAKEOFF - Jump Detection Started', {
      pendingJumpNumber: this.jumpState.currentJump.pendingJumpNumber,
      timestamp: poseData.timestamp,
      performanceTime: jumpDetectionStartTime,
      dateTime: new Date(jumpDetectionStartTimestamp).toISOString(),
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
      pendingJumpNumber: this.jumpState.currentJump?.pendingJumpNumber || 'N/A',
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
      pendingJumpNumber: this.jumpState.currentJump?.pendingJumpNumber || 'N/A',
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
    this.hipVelocityStableStartTime = 0; // Reset stable velocity tracking
    
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
      
      // Calculate actual execution time (high-resolution performance timing)
      const jumpDetectionEndTime = performance.now();
      const jumpDetectionEndTimestamp = Date.now();
      const actualExecutionTimeMs = jump.jumpDetectionStartTime 
        ? (jumpDetectionEndTime - jump.jumpDetectionStartTime) 
        : null;
      const actualExecutionTimeTimestamp = jump.jumpDetectionStartTimestamp 
        ? (jumpDetectionEndTimestamp - jump.jumpDetectionStartTimestamp) 
        : null;
      
      // Log execution time comparison
      console.log('⏱️  JUMP EXECUTION TIME ANALYSIS', {
        'Calculated Airtime (timestamp diff)': `${airtime} ms`,
        'Actual Execution Time (performance.now)': actualExecutionTimeMs !== null 
          ? `${actualExecutionTimeMs.toFixed(2)} ms` 
          : 'N/A',
        'Actual Execution Time (Date.now)': actualExecutionTimeTimestamp !== null 
          ? `${actualExecutionTimeTimestamp} ms` 
          : 'N/A',
        'Difference (performance)': actualExecutionTimeMs !== null 
          ? `${(actualExecutionTimeMs - airtime).toFixed(2)} ms` 
          : 'N/A',
        'Difference (timestamp)': actualExecutionTimeTimestamp !== null 
          ? `${(actualExecutionTimeTimestamp - airtime).toFixed(2)} ms` 
          : 'N/A',
        'Takeoff Timestamp': jump.takeoffTime,
        'Landing Timestamp': jump.landingTime,
        'Takeoff DateTime': new Date(jump.takeoffTime).toISOString(),
        'Landing DateTime': new Date(jump.landingTime).toISOString(),
      });
      
      let jumpHeight = null;
      const scale = this.config.normalizedToMeters || 1.0; // Use scale for all calculations
      // Use a reasonable fallback scale if not calculated
      const effectiveScale = scale > 0 && isFinite(scale) && !isNaN(scale) ? scale : 4.0; // Fallback: ~4m per normalized unit (typical)
      
      // Calculate jump height: difference between takeoff height and peak height
      // In screen coordinates, Y increases downward, so lower Y = higher position
      // peakHeight is the minimum Y (highest point), takeoffHeight is the Y at takeoff
      if (jump.peakHeight !== null && jump.takeoffHeight !== null) {
        const jumpHeightNormalized = jump.takeoffHeight - jump.peakHeight; // Positive = jumped up
        
        // Always calculate jump height using effective scale (use fallback if needed)
        jumpHeight = jumpHeightNormalized * effectiveScale;
        
        // Ensure jumpHeight is non-negative (should always be positive for a jump)
        if (jumpHeight < 0) {
          console.warn('[JumpDetector] Negative jump height detected, setting to 0', {
            jumpHeightNormalized,
            scale,
            effectiveScale,
            takeoffHeight: jump.takeoffHeight,
            peakHeight: jump.peakHeight,
          });
          jumpHeight = 0;
        }
      } else {
        // If height data is missing, try to calculate from available data
        // This can happen if hip center was null during takeoff/peak
        console.warn('[JumpDetector] Missing height data for jump height calculation', {
          peakHeight: jump.peakHeight,
          takeoffHeight: jump.takeoffHeight,
          scale: scale,
          effectiveScale: effectiveScale,
          scaleCalculated: this.config.normalizedToMeters !== null,
        });
        
        // Try to estimate jump height from airtime if we have it
        // Using physics: h = (1/2) * g * t^2, where t is half the airtime
        if (airtime > 0 && airtime < 2000) {
          const halfAirtime = airtime / 2 / 1000; // Convert to seconds
          const estimatedHeight = 0.5 * 9.81 * halfAirtime * halfAirtime;
          if (estimatedHeight > 0 && estimatedHeight < 2.0) { // Reasonable bounds (0-2m)
            jumpHeight = estimatedHeight;
            console.log('[JumpDetector] Estimated jump height from airtime', {
              airtime: airtime,
              estimatedHeight: estimatedHeight,
              estimatedHeightCm: (estimatedHeight * 100).toFixed(1),
            });
          }
        }
      }
      
      // Validate jump (convert minJumpHeight to meters if needed)
      const minJumpHeightMeters = this.config.minJumpHeightNormalized * effectiveScale;
      
      // A jump is valid if:
      // 1. Has minimum airtime (always required)
      // 2. AND (has minimum height OR has very long airtime - long airtime indicates real jump even if height measurement is off)
      const hasMinAirtime = airtime >= this.config.minAirborneTime;
      const hasMinHeight = jumpHeight !== null && jumpHeight >= minJumpHeightMeters;
      const hasLongAirtime = airtime >= 500; // 500ms+ airtime is definitely a real jump
      
      const isValidJump = hasMinAirtime && (hasMinHeight || hasLongAirtime);
      
      // Store the jump number that would be assigned (before incrementing)
      const pendingJumpNumber = this.jumpState.jumpCount + 1;
      
      // Only increment jump count if jump is valid
      // This ensures the count only increases for valid jumps
      const previousJumpCount = this.jumpState.jumpCount;
      if (isValidJump) {
        this.jumpState.jumpCount++;
        console.log('FSM: Jump complete - COUNT INCREMENTED', {
          previousCount: previousJumpCount,
          newCount: this.jumpState.jumpCount,
          jumpNumber: this.jumpState.jumpCount,
          jumpHeight: jumpHeight,
          jumpHeightCm: jumpHeight ? (jumpHeight * 100).toFixed(1) : 'null',
          airtime: airtime,
          peakGRF: jump.peakGRF,
        });
      } else {
        // Invalid jump - don't count it
        console.warn('FSM: Invalid jump discarded - COUNT NOT INCREMENTED', {
          reason: reason,
          currentCount: this.jumpState.jumpCount,
          jumpHeight: jumpHeight,
          jumpHeightCm: jumpHeight ? (jumpHeight * 100).toFixed(1) : 'null',
          jumpHeightNull: jumpHeight === null,
          takeoffHeight: jump.takeoffHeight,
          peakHeight: jump.peakHeight,
          scale: scale,
          airtime: airtime,
          minJumpHeightMeters: minJumpHeightMeters,
          minAirborneTime: this.config.minAirborneTime,
          heightTooSmall: jumpHeight !== null && jumpHeight < minJumpHeightMeters,
          airtimeTooShort: airtime < this.config.minAirborneTime,
        });
      }
      
      // Always trigger landing callback with calculated metrics (even for invalid jumps)
      // This ensures the UI always shows the data
      // Use the actual jump count if valid, or pending number if invalid (so user can see what jump # it would be)
      if (this.onLandingDetected) {
        const landingData = {
          timestamp: jump.landingTime,
          jumpNumber: isValidJump ? this.jumpState.jumpCount : pendingJumpNumber, // Use actual count if valid, pending if invalid
          jumpHeight: jumpHeight,
          airTime: airtime,
          takeoffTime: jump.takeoffTime,
          landingTime: jump.landingTime,
          groundReactionForce: jump.peakGRF,
          isValid: isValidJump, // Include validation status
          // Execution time data for comparison
          executionTimeMs: actualExecutionTimeMs,
          executionTimeTimestamp: actualExecutionTimeTimestamp,
        };
        
        console.log('[JumpDetector] Landing detected - CALLBACK FIRED', {
          airTime: landingData.airTime,
          jumpHeight: landingData.jumpHeight,
          jumpHeightCm: landingData.jumpHeight !== null ? (landingData.jumpHeight * 100).toFixed(1) : 'null',
          landingTime: landingData.landingTime,
          takeoffHeight: jump.takeoffHeight,
          peakHeight: jump.peakHeight,
          jumpHeightNormalized: jump.peakHeight !== null && jump.takeoffHeight !== null 
            ? (jump.takeoffHeight - jump.peakHeight) 
            : 'null',
          scale: scale,
          effectiveScale: effectiveScale,
          isValid: isValidJump,
          jumpNumber: landingData.jumpNumber,
          jumpCount: this.jumpState.jumpCount,
          hasMinAirtime,
          hasMinHeight,
          hasLongAirtime,
          executionTimeMs: landingData.executionTimeMs,
          executionTimeTimestamp: landingData.executionTimeTimestamp,
        });
        
        this.onLandingDetected(landingData);
      }
      
      const jumpEndTime = this.previousPoseData ? this.previousPoseData.timestamp : Date.now();
      this.jumpState.lastJumpEndTime = jumpEndTime;
      
      // Track recent jump times for adaptive cooldown
      this.jumpState.recentJumpTimes.push(jumpEndTime);
      // Keep only last 10 jumps to avoid memory growth
      if (this.jumpState.recentJumpTimes.length > 10) {
        this.jumpState.recentJumpTimes.shift();
      }
      
      this.jumpState.currentJump = null;
    }
    
    if (wasInJump) {
      console.log('FSM: GROUNDED', { reason });
    }
  }

  /**
   * Calculate vertical velocity from pose data
   * Pipeline: Raw landmarks → Raw velocity → Smoothed velocity (EMA)
   * Filters out horizontal movement artifacts to ensure velocity only reflects vertical movement
   */
  calculateVerticalVelocity(poseData) {
    const timerId = performanceProfiler.start('jumpDetector.calculateVerticalVelocity');
    
    if (!this.previousPoseData || !poseData.joints || !this.previousPoseData.joints) {
      if (timerId) performanceProfiler.end(timerId, { skipped: true });
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

    // Calculate horizontal movement to detect if velocity change is due to horizontal movement
    const deltaXNormalized = Math.abs(currentHip.x - previousHip.x);
    const deltaYNormalized = previousHip.y - currentHip.y; // Positive = moving up
    const horizontalVelocityNormalized = deltaXNormalized / timeDelta;
    const rawVelocityNormalized = deltaYNormalized / timeDelta;
    
    // Convert to m/s if scale is available
    const scale = this.config.normalizedToMeters || 1.0;
    const rawVelocityMs = rawVelocityNormalized * scale;
    this.rawVelocity = rawVelocityMs;

    // Filter out velocity changes that are likely due to horizontal movement
    // If horizontal movement is much larger than vertical, ignore the vertical change
    const horizontalMovementThreshold = 0.05; // normalized units/s
    if (horizontalVelocityNormalized > horizontalMovementThreshold && 
        Math.abs(rawVelocityNormalized) < horizontalVelocityNormalized * 0.5) {
      // Likely horizontal movement - decay velocity instead of updating
      this.smoothedVelocity = this.smoothedVelocity * 0.95;
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      return this.smoothedVelocity;
    }

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
    
    if (timerId) performanceProfiler.end(timerId, { velocity: this.smoothedVelocity.toFixed(2) });
    return this.smoothedVelocity; // Returns in m/s
  }

  /**
   * Calculate force based on pose data
   * Pipeline: Smoothed velocity → Acceleration from smoothed velocity → Force
   */
  calculateForce(poseData, verticalVelocity) {
    const timerId = performanceProfiler.start('jumpDetector.calculateForce');
    
    if (!this.previousPoseData) {
      if (timerId) performanceProfiler.end(timerId, { skipped: true });
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
    // IMPORTANT: velocityHistory is updated in calculateVerticalVelocity BEFORE calculateForce is called
    // So when we're here: history[-1] = current frame (just added), history[-2] = previous frame
    // We use history[-2] because we want to compare current (parameter) with previous (history[-2])
    const previousSmoothedVelocity = this.velocityHistory.length >= 2
      ? this.velocityHistory[this.velocityHistory.length - 2] // Previous frame's velocity
      : (this.velocityHistory.length === 1 
          ? this.velocityHistory[0] // If only one entry, use it (first frame)
          : 0);
    
    // Calculate acceleration: a = Δv / Δt
    // verticalVelocity = current frame's smoothed velocity (from parameter)
    // previousSmoothedVelocity = previous frame's smoothed velocity (from history)
    // timeDelta = time difference between current and previous frame
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
    
    const result = {
      verticalVelocity: verticalVelocity,
      acceleration: accelerationMs2,
      weight: weight,
      netForce: netForce,
      totalForce: totalForce,
      mass: this.config.mass,
      timestamp: poseData.timestamp,
    };
    
    if (timerId) performanceProfiler.end(timerId, { totalForce: totalForce.toFixed(0) });
    return result;
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
    
    // MoveNet uses confidence scores (typically 0.25-0.8), BlazePose uses visibility (typically 0.5-1.0)
    // Use a lower threshold for MoveNet to accommodate its lower confidence scores
    // Check if we're using MoveNet by checking if visibility scores are typically lower
    // MoveNet confidence is usually < 0.8, BlazePose visibility is usually > 0.7
    const leftVisibility = leftHip.visibility !== undefined ? leftHip.visibility : 1.0;
    const rightVisibility = rightHip.visibility !== undefined ? rightHip.visibility : 1.0;
    
    // Adaptive threshold: if visibility is consistently low (< 0.7), likely MoveNet, use 0.25 threshold
    // Otherwise, use 0.6 threshold for BlazePose
    const isLikelyMoveNet = leftVisibility < 0.7 && rightVisibility < 0.7;
    const visibilityThreshold = isLikelyMoveNet ? 0.25 : 0.6;
    
    if (leftVisibility < visibilityThreshold) {
      return null;
    }
    if (rightVisibility < visibilityThreshold) {
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
      recentJumpTimes: [],
    };
    this.previousPoseData = null;
    this.rawVelocity = 0;
    this.smoothedVelocity = 0;
    this.velocityHistory = [];
    this.heightHistory = [];
    this.smoothedAcceleration = 0;
    this.baselineHipHeight = null;
    this.baselineAnkleY = null;
    this.ankleYHistory = [];
    this.warmupFrames = 0; // Reset warm-up period
    this.bothAnklesVisibleHistory = []; // Reset visibility history
    this.lastSignificantMovement = 0;
    this.config.normalizedToMeters = null; // Reset scale
    this.personHeightNormalized = null;
    this.scaleCalculationFrames = 0;
    this.upwardVelocityStartTime = 0;
    this.downwardVelocityStartTime = 0;
    this.hipVelocityStableStartTime = 0;
  }
}

// Singleton instance
export const jumpDetector = new JumpDetector();
