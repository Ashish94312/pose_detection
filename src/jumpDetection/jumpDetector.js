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
    
    this.jumpState = {
      jumpCount: 0,
      currentJump: null,
      lastJumpEndTime: 0,
      recentJumpTimes: [],
    };
    
    this.config = {
      // Real-world scaling - will be calculated dynamically from person height
      normalizedToMeters: null, // Will be calculated dynamically
      estimatedPersonHeight: 1.7, // meters - average adult height
      
      takeoffVelocityThreshold: 0.15,
      landingVelocityThreshold: 0.10,
      smallPositiveVelocityThreshold: 0.05,
      
      ankleRiseThreshold: 0.015,
      
      minAirborneTime: 80,
      velocityPositiveDuration: 20,
      hipVelocityStableDuration: 20,
      maxJumpDuration: 2000,
      cooldownAfterJump: 0,
      rapidJumpCooldown: 0,
      
      minJumpHeightNormalized: 0.03,
      
      mass: 70,
      noiseThresholdNormalized: 0.008,
      velocitySmoothing: 0.5,
      accelerationSmoothing: 0.3,
    };
    
    this.rawVelocity = 0;
    this.smoothedVelocity = 0;
    this.velocityHistory = [];
    this.maxHistoryLength = 5;
    
    this.smoothedAcceleration = 0;
    
    this.heightHistory = [];
    this.maxHeightHistoryLength = 10;
    this.baselineHipHeight = null;
    
    this.baselineAnkleY = null;
    this.ankleYHistory = [];
    this.maxAnkleHistoryLength = 20;
    
    this.warmupFrames = 0;
    this.minWarmupFrames = 15;
    this.bothAnklesVisibleHistory = [];
    this.minStableBaselineFrames = 5;
    
    this.personHeightNormalized = null;
    this.scaleCalculationFrames = 0;
    this.minScaleCalculationFrames = 10;
    
    this.stateEntryTime = 0;
    this.lastSignificantMovement = 0;
    this.upwardVelocityStartTime = 0;
    this.downwardVelocityStartTime = 0;
    this.hipVelocityStableStartTime = 0;
    
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
    
    const checkVisibility = (joint) => {
      if (!joint || !joint.visible) return false;
      const visibility = joint.visibility !== undefined ? joint.visibility : 1.0;
      return visibility >= (visibility < 0.7 ? 0.25 : 0.5);
    };
    if (joints.nose && joints.leftAnkle && joints.rightAnkle) {
      const nose = joints.nose;
      const leftAnkle = joints.leftAnkle;
      const rightAnkle = joints.rightAnkle;
      
      if (checkVisibility(nose) && (checkVisibility(leftAnkle) || checkVisibility(rightAnkle))) {
        const ankleY = checkVisibility(leftAnkle) && checkVisibility(rightAnkle)
          ? (leftAnkle.y + rightAnkle.y) / 2
          : (checkVisibility(leftAnkle) ? leftAnkle.y : rightAnkle.y);
        
        const heightNormalized = Math.abs(nose.y - ankleY);
        if (heightNormalized > 0.1 && heightNormalized < 0.9) {
          return {
            heightNormalized: heightNormalized,
            scale: this.config.estimatedPersonHeight / heightNormalized,
            method: 'head-to-ankle'
          };
        }
      }
    }
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
        
        const estimatedTorsoHeight = 0.5;
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
   * Uses adaptive visibility thresholds for MoveNet (lower) and BlazePose (higher)
   */
  getAnkleY(joints) {
    if (!joints) return null;
    
    const leftAnkle = joints.leftAnkle;
    const rightAnkle = joints.rightAnkle;
    
    if (!leftAnkle || !rightAnkle) return null;
    
    const leftVisibility = leftAnkle.visibility !== undefined ? leftAnkle.visibility : 1.0;
    const rightVisibility = rightAnkle.visibility !== undefined ? rightAnkle.visibility : 1.0;
    
    const isLikelyMoveNet = leftVisibility < 0.7 && rightVisibility < 0.7;
    const visibilityThreshold = isLikelyMoveNet ? 0.25 : 0.5;
    const leftVisible = leftAnkle.visible && leftVisibility >= visibilityThreshold;
    const rightVisible = rightAnkle.visible && rightVisibility >= visibilityThreshold;
    
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

  bothFeetAreOffGround(joints) {
    if (!joints || this.baselineAnkleY === null) {
      return false;
    }
    
    const ankleData = this.getAnkleY(joints);
    if (!ankleData || !ankleData.bothVisible) {
      return false;
    }
    
    if (this.warmupFrames < this.minWarmupFrames) {
      return false;
    }
    
    if (this.ankleYHistory.length < this.minStableBaselineFrames) {
      return false;
    }
    
    const leftOffGround = ankleData.left < (this.baselineAnkleY - this.config.ankleRiseThreshold);
    const rightOffGround = ankleData.right < (this.baselineAnkleY - this.config.ankleRiseThreshold);
    
    return leftOffGround && rightOffGround;
  }

  feetTouchingGround(joints) {
    if (!joints || this.baselineAnkleY === null) {
      return false;
    }
    
    const ankleData = this.getAnkleY(joints);
    if (!ankleData) {
      return false;
    }
    
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

  updateBaselineAnkleHeight(joints, verticalVelocity) {
    const ankleData = this.getAnkleY(joints);
    
    if (ankleData && ankleData.bothVisible) {
      this.bothAnklesVisibleHistory.push(true);
      if (this.bothAnklesVisibleHistory.length > 60) {
        this.bothAnklesVisibleHistory.shift();
      }
      
      const recentHistory = this.bothAnklesVisibleHistory.slice(-this.minWarmupFrames * 2);
      const visibleCount = recentHistory.filter(v => v === true).length;
      
      if (visibleCount >= this.minWarmupFrames) {
        this.warmupFrames = this.minWarmupFrames;
      } else {
        this.warmupFrames = visibleCount;
      }
    } else {
      this.bothAnklesVisibleHistory.push(false);
      if (this.bothAnklesVisibleHistory.length > 60) {
        this.bothAnklesVisibleHistory.shift();
      }
      
      const recentHistory = this.bothAnklesVisibleHistory.slice(-10);
      if (recentHistory.filter(v => v === false).length >= 8) {
        this.warmupFrames = 0;
      }
    }
    
    if (!ankleData) {
      return;
    }
    
    const absVelocity = Math.abs(verticalVelocity);
    const noiseThreshold = this.config.noiseThresholdNormalized * (this.config.normalizedToMeters || 1.0);
    
    if (absVelocity < noiseThreshold) {
      const ankleYToUse = ankleData.bothVisible ? ankleData.average : 
                          (ankleData.left !== null ? ankleData.left : 
                           (ankleData.right !== null ? ankleData.right : null));
      
      if (ankleYToUse !== null) {
        this.ankleYHistory.push(ankleYToUse);
        if (this.ankleYHistory.length > this.maxAnkleHistoryLength) {
          this.ankleYHistory.shift();
        }
        
        if (this.ankleYHistory.length >= this.minStableBaselineFrames) {
          const sum = this.ankleYHistory.reduce((a, b) => a + b, 0);
          this.baselineAnkleY = sum / this.ankleYHistory.length;
        } else if (this.baselineAnkleY === null && this.ankleYHistory.length >= 3) {
          const sum = this.ankleYHistory.reduce((a, b) => a + b, 0);
          this.baselineAnkleY = sum / this.ankleYHistory.length;
        }
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
      if (process.env.NODE_ENV === 'development' && !this.previousPoseData) {
        console.warn('[JumpDetector] Skipped pose data - missing joints', {
          hasPoseData: !!poseData,
          hasJoints: !!poseData?.joints,
          poseDataKeys: poseData ? Object.keys(poseData) : [],
        });
      }
      return;
    }

    if (this.config.normalizedToMeters === null) {
      this.scaleCalculationFrames++;
      const scaleInfo = this.calculateScaleFactor(poseData);
      
      if (scaleInfo) {
        if (this.scaleCalculationFrames >= this.minScaleCalculationFrames) {
          if (this.config.normalizedToMeters === null) {
            this.config.normalizedToMeters = scaleInfo.scale;
            this.personHeightNormalized = scaleInfo.heightNormalized;
            console.log(`[JumpDetector] Scale calculated: ${scaleInfo.scale.toFixed(2)} m/unit (${scaleInfo.method})`);
          } else {
            const alpha = 0.1;
            this.config.normalizedToMeters = 
              alpha * scaleInfo.scale + (1 - alpha) * this.config.normalizedToMeters;
          }
        }
      } else if (this.scaleCalculationFrames >= 30) {
        const fallbackScale = this.config.estimatedPersonHeight / 0.4;
        this.config.normalizedToMeters = fallbackScale;
        console.log(`[JumpDetector] Using fallback scale: ${fallbackScale.toFixed(2)} m/unit`);
      }
    }

    const verticalVelocity = this.calculateVerticalVelocity(poseData);
    const force = this.calculateForce(poseData, verticalVelocity);
    
    if (!this.previousPoseData) {
      this.previousPoseData = poseData;
      this.stateEntryTime = poseData.timestamp;
      
      const hipCenter = this.getHipCenter(poseData.joints);
      if (hipCenter && this.baselineHipHeight === null) {
        this.baselineHipHeight = hipCenter.y;
      }
      
      this.updateBaselineAnkleHeight(poseData.joints, verticalVelocity);
      return;
    }

    const hipCenter = this.getHipCenter(poseData.joints);
    if (hipCenter) {
      this.heightHistory.push(hipCenter.y);
      if (this.heightHistory.length > this.maxHeightHistoryLength) {
        this.heightHistory.shift();
      }
      
      if (this.baselineHipHeight === null) {
        this.baselineHipHeight = hipCenter.y;
      }
    }

    if (this.fsmState === FSM_STATES.GROUNDED) {
      this.updateBaselineAnkleHeight(poseData.joints, verticalVelocity);
    }

    this.processFSM(poseData, verticalVelocity, force, hipCenter);

    if (force && this.onForceCalculated) {
      this.onForceCalculated(force);
    }
    
    this.previousPoseData = poseData;
    
    if (timerId) performanceProfiler.end(timerId, { fsmState: this.fsmState });
  }

  processFSM(poseData, verticalVelocity, force, hipCenter) {
    const timerId = performanceProfiler.start('jumpDetector.processFSM', { state: this.fsmState });
    const currentTime = poseData.timestamp;
    const timeInState = currentTime - this.stateEntryTime;

    switch (this.fsmState) {
      case FSM_STATES.GROUNDED:
        if (this.canTransitionToTakeoff(poseData, verticalVelocity, timeInState)) {
          this.transitionToTakeoff(poseData, hipCenter);
        }
        break;

      case FSM_STATES.TAKEOFF:
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        if (this.canTransitionToAirborne(poseData, verticalVelocity, timeInState)) {
          this.transitionToAirborne(poseData, hipCenter);
        }
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Takeoff timeout');
        }
        break;

      case FSM_STATES.AIRBORNE:
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        if (this.canTransitionToLanding(poseData, verticalVelocity, timeInState)) {
          this.transitionToLanding(poseData);
        }
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Airborne timeout');
        }
        break;

      case FSM_STATES.LANDING:
        if (hipCenter && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakHeight === null || 
              hipCenter.y < this.jumpState.currentJump.peakHeight) {
            this.jumpState.currentJump.peakHeight = hipCenter.y;
          }
        }
        
        if (force && this.jumpState.currentJump) {
          if (this.jumpState.currentJump.peakGRF === null ||
              force.totalForce > this.jumpState.currentJump.peakGRF) {
            this.jumpState.currentJump.peakGRF = force.totalForce;
          }
        }
        
        if (this.canTransitionToGrounded(poseData, verticalVelocity, timeInState)) {
          this.transitionToGrounded('Landing complete');
        }
        if (timeInState > this.config.maxJumpDuration) {
          this.transitionToGrounded('Landing timeout');
        }
        break;
    }
    
    if (timerId) performanceProfiler.end(timerId, { state: this.fsmState });
  }

  canTransitionToTakeoff(poseData, verticalVelocity, timeInState) {
    if (this.warmupFrames < this.minWarmupFrames) {
      return false;
    }
    
    if (!this.baselineAnkleY || this.ankleYHistory.length < this.minStableBaselineFrames) {
      return false;
    }
    
    const timeSinceLastJump = poseData.timestamp - this.jumpState.lastJumpEndTime;
    if (timeSinceLastJump < 50 && this.jumpState.currentJump !== null) {
      return false;
    }

    const hasUpwardVelocity = verticalVelocity > this.config.takeoffVelocityThreshold;
    
    if (hasUpwardVelocity) {
      if (this.upwardVelocityStartTime === 0) {
        this.upwardVelocityStartTime = poseData.timestamp;
      }
      
      const timeSinceUpwardVelocity = poseData.timestamp - this.upwardVelocityStartTime;
      if (timeSinceUpwardVelocity < this.config.velocityPositiveDuration) {
        return false;
      }
    } else {
      this.upwardVelocityStartTime = 0;
      return false;
    }

    if (!this.bothFeetAreOffGround(poseData.joints)) {
      return false;
    }

    return true;
  }

  canTransitionToAirborne(poseData, verticalVelocity, timeInState) {
    if (!this.bothFeetAreOffGround(poseData.joints)) {
      return false;
    }
    
    return verticalVelocity <= this.config.smallPositiveVelocityThreshold;
  }

  canTransitionToLanding(poseData, verticalVelocity, timeInState) {
    if (timeInState < this.config.minAirborneTime) {
      return false;
    }

    const hasDownwardVelocity = verticalVelocity < -this.config.landingVelocityThreshold;
    
    if (!hasDownwardVelocity) {
      return false;
    }

    if (!this.feetTouchingGround(poseData.joints)) {
      return false;
    }
    
    return true;
  }

  canTransitionToGrounded(poseData, verticalVelocity, timeInState) {
    const absVelocity = Math.abs(verticalVelocity);
    const noiseThreshold = this.config.noiseThresholdNormalized * (this.config.normalizedToMeters || 1.0);
    
    const stabilityThreshold = noiseThreshold * 1.5;
    
    if (absVelocity < stabilityThreshold) {
      if (this.hipVelocityStableStartTime === 0) {
        this.hipVelocityStableStartTime = poseData.timestamp;
      }
      
      const timeSinceStable = poseData.timestamp - this.hipVelocityStableStartTime;
      return timeSinceStable >= this.config.hipVelocityStableDuration;
    } else {
      this.hipVelocityStableStartTime = 0;
      return false;
    }
  }

  transitionToTakeoff(poseData, hipCenter) {
    const jumpDetectionStartTime = performance.now();
    const jumpDetectionStartTimestamp = Date.now();
    
    this.fsmState = FSM_STATES.TAKEOFF;
    this.stateEntryTime = poseData.timestamp;
    
    this.jumpState.currentJump = {
      takeoffTime: poseData.timestamp,
      takeoffHeight: hipCenter ? hipCenter.y : null,
      landingTime: null,
      peakHeight: hipCenter ? hipCenter.y : null,
      peakGRF: null,
      airtime: 0,
      pendingJumpNumber: this.jumpState.jumpCount + 1,
      jumpDetectionStartTime: jumpDetectionStartTime,
      jumpDetectionStartTimestamp: jumpDetectionStartTimestamp,
    };
    
    if (this.onJumpDetected) {
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

  transitionToAirborne(poseData, hipCenter) {
    this.fsmState = FSM_STATES.AIRBORNE;
    this.stateEntryTime = poseData.timestamp;
    
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

  transitionToLanding(poseData) {
    this.fsmState = FSM_STATES.LANDING;
    this.stateEntryTime = poseData.timestamp;
    this.downwardVelocityStartTime = 0;
    
    if (this.jumpState.currentJump) {
      this.jumpState.currentJump.landingTime = poseData.timestamp;
    }
    
    console.log('FSM: LANDING', {
      pendingJumpNumber: this.jumpState.currentJump?.pendingJumpNumber || 'N/A',
      timestamp: poseData.timestamp,
    });
  }

  transitionToGrounded(reason) {
    const wasInJump = this.fsmState !== FSM_STATES.GROUNDED;
    
    this.fsmState = FSM_STATES.GROUNDED;
    this.stateEntryTime = this.previousPoseData ? this.previousPoseData.timestamp : Date.now();
    this.upwardVelocityStartTime = 0;
    this.downwardVelocityStartTime = 0;
    this.hipVelocityStableStartTime = 0;
    
    if (wasInJump && this.jumpState.currentJump) {
      const jump = this.jumpState.currentJump;
      
      if (!jump.landingTime) {
        jump.landingTime = this.previousPoseData ? this.previousPoseData.timestamp : Date.now();
      }
      
      const airtime = jump.landingTime && jump.takeoffTime 
        ? jump.landingTime - jump.takeoffTime 
        : 0;
      
      const jumpDetectionEndTime = performance.now();
      const jumpDetectionEndTimestamp = Date.now();
      const actualExecutionTimeMs = jump.jumpDetectionStartTime 
        ? (jumpDetectionEndTime - jump.jumpDetectionStartTime) 
        : null;
      const actualExecutionTimeTimestamp = jump.jumpDetectionStartTimestamp 
        ? (jumpDetectionEndTimestamp - jump.jumpDetectionStartTimestamp) 
        : null;
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
      const scale = this.config.normalizedToMeters || 1.0;
      const effectiveScale = scale > 0 && isFinite(scale) && !isNaN(scale) ? scale : 4.0;
      
      if (jump.peakHeight !== null && jump.takeoffHeight !== null) {
        const jumpHeightNormalized = jump.takeoffHeight - jump.peakHeight;
        
        jumpHeight = jumpHeightNormalized * effectiveScale;
        
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
        console.warn('[JumpDetector] Missing height data for jump height calculation', {
          peakHeight: jump.peakHeight,
          takeoffHeight: jump.takeoffHeight,
          scale: scale,
          effectiveScale: effectiveScale,
          scaleCalculated: this.config.normalizedToMeters !== null,
        });
        
        if (airtime > 0 && airtime < 2000) {
          const halfAirtime = airtime / 2 / 1000;
          const estimatedHeight = 0.5 * 9.81 * halfAirtime * halfAirtime;
          if (estimatedHeight > 0 && estimatedHeight < 2.0) {
            jumpHeight = estimatedHeight;
            console.log('[JumpDetector] Estimated jump height from airtime', {
              airtime: airtime,
              estimatedHeight: estimatedHeight,
              estimatedHeightCm: (estimatedHeight * 100).toFixed(1),
            });
          }
        }
      }
      
      const minJumpHeightMeters = this.config.minJumpHeightNormalized * effectiveScale;
      
      const hasMinAirtime = airtime >= this.config.minAirborneTime;
      const hasMinHeight = jumpHeight !== null && jumpHeight >= minJumpHeightMeters;
      const hasLongAirtime = airtime >= 500;
      
      const isValidJump = hasMinAirtime && (hasMinHeight || hasLongAirtime);
      
      const pendingJumpNumber = this.jumpState.jumpCount + 1;
      
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
      
      if (this.onLandingDetected) {
        const landingData = {
          timestamp: jump.landingTime,
          jumpNumber: isValidJump ? this.jumpState.jumpCount : pendingJumpNumber,
          jumpHeight: jumpHeight,
          airTime: airtime,
          takeoffTime: jump.takeoffTime,
          landingTime: jump.landingTime,
          groundReactionForce: jump.peakGRF,
          isValid: isValidJump,
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
      
      this.jumpState.recentJumpTimes.push(jumpEndTime);
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

    const deltaXNormalized = Math.abs(currentHip.x - previousHip.x);
    const deltaYNormalized = previousHip.y - currentHip.y;
    const horizontalVelocityNormalized = deltaXNormalized / timeDelta;
    const rawVelocityNormalized = deltaYNormalized / timeDelta;
    
    const scale = this.config.normalizedToMeters || 1.0;
    const rawVelocityMs = rawVelocityNormalized * scale;
    this.rawVelocity = rawVelocityMs;

    const horizontalMovementThreshold = 0.05;
    if (horizontalVelocityNormalized > horizontalMovementThreshold && 
        Math.abs(rawVelocityNormalized) < horizontalVelocityNormalized * 0.5) {
      this.smoothedVelocity = this.smoothedVelocity * 0.95;
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      return this.smoothedVelocity;
    }

    const noiseThresholdNormalized = this.config.noiseThresholdNormalized;
    const absVelocityNormalized = Math.abs(rawVelocityNormalized);
    if (absVelocityNormalized < noiseThresholdNormalized) {
      this.smoothedVelocity = this.smoothedVelocity * 0.9;
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      
      if (this.baselineHipHeight === null || 
          Math.abs(currentHip.y - this.baselineHipHeight) < 0.01) {
        this.baselineHipHeight = currentHip.y;
      }
      this.lastSignificantMovement = poseData.timestamp;
      return this.smoothedVelocity;
    }
    
    if (this.smoothedVelocity === 0) {
      this.smoothedVelocity = rawVelocityMs;
    } else {
      this.smoothedVelocity = 
        this.config.velocitySmoothing * rawVelocityMs + 
        (1 - this.config.velocitySmoothing) * this.smoothedVelocity;
    }
    
    this.velocityHistory.push(this.smoothedVelocity);
    if (this.velocityHistory.length > this.maxHistoryLength) {
      this.velocityHistory.shift();
    }
    
    this.lastSignificantMovement = poseData.timestamp;
    
    if (timerId) performanceProfiler.end(timerId, { velocity: this.smoothedVelocity.toFixed(2) });
    return this.smoothedVelocity;
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
    
    const previousSmoothedVelocity = this.velocityHistory.length >= 2
      ? this.velocityHistory[this.velocityHistory.length - 2]
      : (this.velocityHistory.length === 1 
          ? this.velocityHistory[0]
          : 0);
    
    let rawAcceleration = (verticalVelocity - previousSmoothedVelocity) / timeDelta;
    rawAcceleration = Math.max(Math.min(rawAcceleration, 50), -50);
    
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
    
    const leftVisibility = leftHip.visibility !== undefined ? leftHip.visibility : 1.0;
    const rightVisibility = rightHip.visibility !== undefined ? rightHip.visibility : 1.0;
    
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
    this.warmupFrames = 0;
    this.bothAnklesVisibleHistory = [];
    this.lastSignificantMovement = 0;
    this.config.normalizedToMeters = null;
    this.personHeightNormalized = null;
    this.scaleCalculationFrames = 0;
    this.upwardVelocityStartTime = 0;
    this.downwardVelocityStartTime = 0;
    this.hipVelocityStableStartTime = 0;
  }
}

export const jumpDetector = new JumpDetector();

export { JumpDetector };
