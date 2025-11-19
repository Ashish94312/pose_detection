/**
 * Jump Detection Module
 * Detects jumps, landings, and calculates force
 * Can be easily removed by deleting the jumpDetection folder
 */

import { posePubSub } from '../utils/pubsub';

class JumpDetector {
  constructor() {
    this.isSubscribed = false;
    this.unsubscribe = null;
    
    // State tracking
    this.previousPoseData = null;
    this.jumpState = {
      isJumping: false,
      isInAir: false,
      isLanding: false,
      jumpStartTime: null,
      takeoffTime: null, // Time when jump actually started (takeoff)
      peakHeight: null,
      landingTime: null,
      jumpCount: 0,
      lastJumpEndTime: 0, // Track when last jump ended to prevent double counting
      currentAirtime: 0, // Current airtime in milliseconds
      peakLandingForce: null, // Peak ground reaction force during landing
    };
    
    // Thresholds - optimized for better detection
    // Note: Normalized coordinates (0-1) need conversion to real-world units
    // Assuming typical person height ~1.7m, normalized Y range represents ~2m
    this.config = {
      // Real-world scaling factors
      normalizedToMeters: 2.0, // Convert normalized units to meters (typical person height range)
      fps: 60, // Typical frame rate for velocity calculations
      
      // Velocity thresholds in m/s (converted from normalized)
      verticalVelocityThreshold: 0.3, // Upward velocity threshold (m/s) - ~0.15 normalized * 2
      landingVelocityThreshold: 0.2, // Downward velocity threshold (m/s) - ~0.10 normalized * 2
      
      // Height thresholds in meters
      minJumpHeight: 0.10, // Minimum jump height (meters) - ~0.05 normalized * 2
      minCrouchDepth: 0.06, // Minimum hip drop (meters) - ~0.03 normalized * 2
      
      // Time thresholds
      minAirTime: 80, // Minimum air time (milliseconds)
      maxTimeBetweenJumpAndLand: 2000, // Max time for a jump to complete (milliseconds)
      cooldownAfterJump: 500, // Cooldown period after jump ends (milliseconds)
      
      // Other settings
      mass: 70, // kg (default, can be set by user)
      noiseThreshold: 0.02, // m/s - ignore movements smaller than this
      velocitySmoothing: 0.4, // EMA smoothing factor (0-1, higher = less smoothing, more responsive)
    };
    
    // Velocity smoothing
    this.smoothedVelocity = 0;
    this.velocityHistory = [];
    this.maxHistoryLength = 5;
    
    // Acceleration smoothing
    this.smoothedAcceleration = 0;
    this.accelerationSmoothing = 0.2; // Strong smoothing for acceleration
    
    // Height tracking for better peak detection
    this.heightHistory = [];
    this.maxHeightHistoryLength = 10;
    
    // Callbacks
    this.onJumpDetected = null;
    this.onLandingDetected = null;
    this.onForceCalculated = null;
  }

  /**
   * Set mass for force calculations
   * @param {number} mass - Mass in kilograms
   */
  setMass(mass) {
    if (mass > 0 && mass <= 500) {
      this.config.mass = mass;
      console.log('Mass updated to:', mass, 'kg');
    } else {
      console.warn('Invalid mass value. Must be between 0 and 500 kg');
    }
  }

  /**
   * Get current mass setting
   * @returns {number} Current mass in kg
   */
  getMass() {
    return this.config.mass;
  }

  /**
   * Subscribe to pose data feed
   */
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

  /**
   * Unsubscribe from pose data feed
   */
  unsubscribeFromFeed() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isSubscribed = false;
    console.log('JumpDetector unsubscribed from pose data feed');
  }

  /**
   * Process incoming pose data
   * @param {Object} poseData - Pose data from pub/sub
   */
  processPoseData(poseData) {
    if (!poseData || !poseData.joints) {
      return;
    }

    // Calculate vertical velocity (with noise filtering and smoothing)
    const verticalVelocity = this.calculateVerticalVelocity(poseData);
    
    // Only process if we have valid previous data
    if (!this.previousPoseData) {
      this.previousPoseData = poseData;
      return;
    }
    
    // Get current hip height for tracking
    const hipCenter = this.getHipCenter(poseData.joints);
    if (hipCenter) {
      this.heightHistory.push(hipCenter.y);
      if (this.heightHistory.length > this.maxHeightHistoryLength) {
        this.heightHistory.shift();
      }
    }
    
    // Detect jump (only when not already jumping/in air and after cooldown)
    const timeSinceLastJump = poseData.timestamp - this.jumpState.lastJumpEndTime;
    if (!this.jumpState.isJumping && !this.jumpState.isInAir && 
        timeSinceLastJump >= this.config.cooldownAfterJump) {
      if (this.detectJumpStart(poseData, verticalVelocity)) {
        this.handleJumpStart(poseData);
      }
    }
    
    // Track jump in progress
    if (this.jumpState.isJumping || this.jumpState.isInAir) {
      this.trackJump(poseData, verticalVelocity);
    }
    
    // Detect landing (only when in air)
    if (this.jumpState.isInAir) {
      // Track peak landing force during landing phase
      const currentForce = this.calculateForce(poseData, verticalVelocity);
      if (currentForce && currentForce.totalForce) {
        if (this.jumpState.peakLandingForce === null || 
            currentForce.totalForce > this.jumpState.peakLandingForce) {
          this.jumpState.peakLandingForce = currentForce.totalForce;
        }
      }
      
      if (this.detectLanding(poseData, verticalVelocity)) {
        this.handleLanding(poseData);
      }
    }
    
    // Calculate force
    const force = this.calculateForce(poseData, verticalVelocity);
    if (force && this.onForceCalculated) {
      this.onForceCalculated(force);
    }
    
    this.previousPoseData = poseData;
  }

  /**
   * Calculate vertical velocity from pose data
   * Converts normalized coordinates to real-world units (m/s)
   * Includes noise filtering and smoothing to handle edge cases
   * @param {Object} poseData - Current pose data
   * @returns {number} Vertical velocity in m/s (positive = upward, negative = downward)
   */
  calculateVerticalVelocity(poseData) {
    if (!this.previousPoseData || !poseData.joints || !this.previousPoseData.joints) {
      return 0;
    }

    // Use hip center as reference point for vertical movement
    const currentHip = this.getHipCenter(poseData.joints);
    const previousHip = this.getHipCenter(this.previousPoseData.joints);
    
    if (!currentHip || !previousHip || !currentHip.visible || !previousHip.visible) {
      // Reset smoothing when landmarks not visible
      this.smoothedVelocity = this.smoothedVelocity * 0.8; // Decay
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      return this.smoothedVelocity;
    }

    // Calculate time delta in seconds
    const timeDelta = (poseData.timestamp - this.previousPoseData.timestamp) / 1000;
    if (timeDelta <= 0 || timeDelta > 0.1) {
      // Skip if time delta is invalid or too large (likely dropped frame)
      return this.smoothedVelocity;
    }

    // Calculate position change in normalized coordinates
    // In normalized coordinates: Y increases downward (0 = top, 1 = bottom)
    // So: previousY - currentY = positive when moving up (correct)
    const deltaYNormalized = previousHip.y - currentHip.y;
    
    // Convert normalized position change to meters
    const deltaYMeters = deltaYNormalized * this.config.normalizedToMeters;
    
    // Calculate velocity in m/s: v = Δy / Δt
    // Positive velocity = upward movement, negative = downward
    const rawVelocityMs = deltaYMeters / timeDelta;
    
    // Filter out noise - ignore very small movements (in m/s)
    const absVelocity = Math.abs(rawVelocityMs);
    if (absVelocity < this.config.noiseThreshold) {
      // Movement is too small, treat as stationary
      // Apply smoothing to gradually reduce velocity to zero
      this.smoothedVelocity = this.smoothedVelocity * 0.9; // Decay towards zero
      if (Math.abs(this.smoothedVelocity) < 0.01) {
        this.smoothedVelocity = 0;
      }
      return this.smoothedVelocity;
    }
    
    // Apply exponential moving average smoothing
    if (this.smoothedVelocity === 0) {
      this.smoothedVelocity = rawVelocityMs;
    } else {
      this.smoothedVelocity = 
        this.config.velocitySmoothing * rawVelocityMs + 
        (1 - this.config.velocitySmoothing) * this.smoothedVelocity;
    }
    
    // Store in history for additional filtering
    this.velocityHistory.push(this.smoothedVelocity);
    if (this.velocityHistory.length > this.maxHistoryLength) {
      this.velocityHistory.shift();
    }
    
    // Return smoothed velocity in m/s
    return this.smoothedVelocity;
  }

  /**
   * Get center point between hips
   * @param {Object} joints - Joints object
   * @returns {Object|null} Hip center point
   */
  getHipCenter(joints) {
    if (!joints || !joints.leftHip || !joints.rightHip) {
      return null;
    }

    const leftHip = joints.leftHip;
    const rightHip = joints.rightHip;

    if (!leftHip.visible || !rightHip.visible) {
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
   * Detect jump start - simplified and more reliable
   * @param {Object} poseData - Current pose data
   * @param {number} verticalVelocity - Vertical velocity in m/s (smoothed)
   * @returns {boolean} True if jump detected
   */
  detectJumpStart(poseData, verticalVelocity) {
    // Must have significant upward velocity (positive = upward in our system)
    // Threshold is in m/s now
    if (verticalVelocity <= this.config.verticalVelocityThreshold) {
      return false;
    }
    
    // Optional: Check for crouch position (knees bent)
    // This helps avoid false positives but is not required
    const angles = poseData.angles;
    if (angles) {
      const leftKnee = angles.leftLeg?.knee;
      const rightKnee = angles.rightLeg?.knee;
      
      // At least one knee should be bent (more lenient)
      const hasBentKnee = (leftKnee !== null && leftKnee < 150) || 
                          (rightKnee !== null && rightKnee < 150);
      
      // Optional crouch check - hip lower than shoulder
      let hasCrouch = true; // Default to true if we can't check
      const joints = poseData.joints;
      if (joints && joints.leftHip && joints.leftShoulder) {
        const hipY = joints.leftHip.y;
        const shoulderY = joints.leftShoulder.y;
        const hipDropNormalized = hipY - shoulderY;
        const hipDropMeters = hipDropNormalized * this.config.normalizedToMeters;
        hasCrouch = hipDropMeters >= this.config.minCrouchDepth;
      }
      
      // If we have angle data, prefer jumps with bent knees or crouch
      // But don't require both
      if (!hasBentKnee && !hasCrouch) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Handle jump start (takeoff)
   * @param {Object} poseData - Pose data at jump start
   */
  handleJumpStart(poseData) {
    const hipCenter = this.getHipCenter(poseData.joints);
    
    this.jumpState.isJumping = true;
    this.jumpState.isInAir = false;
    this.jumpState.jumpStartTime = poseData.timestamp;
    this.jumpState.takeoffTime = poseData.timestamp; // Record takeoff time
    this.jumpState.peakHeight = hipCenter ? hipCenter.y : null;
    this.jumpState.jumpCount++;
    this.jumpState.currentAirtime = 0;
    this.jumpState.peakLandingForce = null; // Reset for new jump
    
    if (this.onJumpDetected) {
      this.onJumpDetected({
        timestamp: poseData.timestamp,
        jumpNumber: this.jumpState.jumpCount,
        startHeight: hipCenter ? hipCenter.y : null,
        takeoffTime: poseData.timestamp,
      });
    }
    
    console.log('Takeoff detected!', {
      jumpNumber: this.jumpState.jumpCount,
      timestamp: poseData.timestamp,
      takeoffTime: poseData.timestamp,
    });
  }

  /**
   * Track jump in progress
   * @param {Object} poseData - Current pose data
   * @param {number} verticalVelocity - Vertical velocity
   */
  trackJump(poseData, verticalVelocity) {
    const hipCenter = this.getHipCenter(poseData.joints);
    
    if (!hipCenter) {
      // If we lose tracking during jump, cancel it
      this.cancelJump('Lost tracking');
      return;
    }
    
    // Update peak height (lowest Y = highest point)
    if (this.jumpState.peakHeight === null || hipCenter.y < this.jumpState.peakHeight) {
      this.jumpState.peakHeight = hipCenter.y;
    }
    
    // Transition to in-air when upward velocity stops (reached peak)
    // Positive velocity = upward, negative = downward (in m/s)
    // When velocity becomes negative or near zero, we've reached peak
    if (this.jumpState.isJumping) {
      // Transition to in-air when velocity is no longer strongly upward
      // Threshold: 0.06 m/s (small upward velocity or downward)
      if (verticalVelocity <= 0.06) {
        this.jumpState.isJumping = false;
        this.jumpState.isInAir = true;
        // Takeoff is complete when we transition to in-air
        if (!this.jumpState.takeoffTime) {
          this.jumpState.takeoffTime = poseData.timestamp;
        }
      }
    }
    
    // Update current airtime if in air
    if (this.jumpState.isInAir && this.jumpState.takeoffTime) {
      this.jumpState.currentAirtime = poseData.timestamp - this.jumpState.takeoffTime;
    }
    
    // Safety: If jump takes too long, cancel it
    const jumpDuration = poseData.timestamp - (this.jumpState.jumpStartTime || poseData.timestamp);
    if (jumpDuration > this.config.maxTimeBetweenJumpAndLand) {
      this.cancelJump('Jump duration too long');
      return;
    }
  }

  /**
   * Detect landing
   * @param {Object} poseData - Current pose data
   * @param {number} verticalVelocity - Vertical velocity in m/s
   * @returns {boolean} True if landing detected
   */
  detectLanding(poseData, verticalVelocity) {
    // Must have significant downward velocity (negative = downward in m/s)
    if (verticalVelocity >= -this.config.landingVelocityThreshold) {
      return false;
    }
    
    // Check if enough time has passed (minimum air time)
    const airTime = poseData.timestamp - (this.jumpState.jumpStartTime || poseData.timestamp);
    if (airTime < this.config.minAirTime) {
      return false;
    }
    
    return true;
  }

  /**
   * Handle landing
   * @param {Object} poseData - Pose data at landing
   */
  handleLanding(poseData) {
    const hipCenter = this.getHipCenter(poseData.joints);
    // Calculate jump height in meters
    const jumpHeightNormalized = this.jumpState.peakHeight && hipCenter 
      ? this.jumpState.peakHeight - hipCenter.y 
      : null;
    const jumpHeight = jumpHeightNormalized !== null 
      ? jumpHeightNormalized * this.config.normalizedToMeters 
      : null;
    
    // Calculate airtime from takeoff to landing
    const takeoffTime = this.jumpState.takeoffTime || this.jumpState.jumpStartTime;
    const airTime = takeoffTime ? poseData.timestamp - takeoffTime : 0;
    
    // Validate jump - if it doesn't meet requirements, cancel it
    if (jumpHeight !== null && jumpHeight < this.config.minJumpHeight) {
      console.warn('Jump height too small, canceling jump');
      this.cancelJump('Jump height too small');
      return;
    }
    
    if (airTime < this.config.minAirTime) {
      console.warn('Air time too short, canceling jump');
      this.cancelJump('Air time too short');
      return;
    }
    
    // Use the peak landing force we've been tracking during landing phase
    const groundReactionForce = this.jumpState.peakLandingForce;
    
    // Valid landing - update state
    this.jumpState.isInAir = false;
    this.jumpState.isJumping = false;
    this.jumpState.isLanding = true;
    this.jumpState.landingTime = poseData.timestamp;
    this.jumpState.lastJumpEndTime = poseData.timestamp;
    this.jumpState.currentAirtime = airTime;
    
    if (this.onLandingDetected) {
      this.onLandingDetected({
        timestamp: poseData.timestamp,
        jumpNumber: this.jumpState.jumpCount,
        jumpHeight: jumpHeight,
        airTime: airTime,
        takeoffTime: takeoffTime,
        landingTime: poseData.timestamp,
        groundReactionForce: this.jumpState.peakLandingForce,
      });
    }
    
    console.log('Landing detected!', {
      jumpNumber: this.jumpState.jumpCount,
      jumpHeight: jumpHeight,
      airTime: airTime,
      takeoffTime: takeoffTime,
      landingTime: poseData.timestamp,
      groundReactionForce: this.jumpState.peakLandingForce,
    });
    
    // Reset after landing (with delay to show landing state)
    setTimeout(() => {
      this.jumpState.isLanding = false;
      this.jumpState.jumpStartTime = null;
      this.jumpState.takeoffTime = null;
      this.jumpState.peakHeight = null;
      this.jumpState.landingTime = null;
      this.jumpState.currentAirtime = 0;
      // Keep peakLandingForce until next jump
    }, 500);
  }

  /**
   * Cancel a jump (invalid jump)
   * @param {string} reason - Reason for cancellation
   */
  cancelJump(reason) {
    console.warn('Canceling jump:', reason);
    // Decrement count if jump was already counted
    if (this.jumpState.jumpCount > 0) {
      this.jumpState.jumpCount--;
    }
    this.resetJumpState();
  }

  /**
   * Calculate force based on pose data
   * 
   * Force Calculation Method:
   * 1. Calculate vertical velocity from hip center position change (in m/s)
   * 2. Calculate acceleration from velocity change over time (in m/s²)
   * 3. Apply Newton's Second Law: F = m × a
   * 
   * Force Components:
   * - Weight (mg): Force due to gravity when stationary = m × g
   * - Net Force: Additional force from acceleration = m × a
   * - Total Force: Weight + Net Force = m × (g + a)
   * 
   * When stationary (a ≈ 0): Net Force ≈ 0, Total Force = Weight = m × g
   * When jumping (a > 0 upward): Net Force = m × a (positive), Total Force > Weight
   * When landing (a < 0 downward): Net Force = m × a (negative), but impact increases force
   * 
   * @param {Object} poseData - Current pose data
   * @param {number} verticalVelocity - Vertical velocity in m/s
   * @returns {Object|null} Force data
   */
  calculateForce(poseData, verticalVelocity) {
    if (!this.previousPoseData) {
      return null;
    }

    const timeDelta = (poseData.timestamp - this.previousPoseData.timestamp) / 1000;
    if (timeDelta <= 0 || timeDelta > 0.1) {
      // Invalid or dropped frame
      return null;
    }

    // Check if stationary first - if velocity is very small, treat as stationary
    const absVelocity = Math.abs(verticalVelocity);
    const isStationary = absVelocity < this.config.noiseThreshold * 2;
    
    // Get previous smoothed velocity from history (already in m/s)
    const previousVelocity = this.velocityHistory.length > 1
      ? this.velocityHistory[this.velocityHistory.length - 2]
      : 0;
    
    // Calculate acceleration in m/s²: a = Δv / Δt
    // Velocity is already in m/s, so acceleration is directly in m/s²
    let rawAcceleration = (verticalVelocity - previousVelocity) / timeDelta;
    
    // Apply strong smoothing to acceleration to filter noise
    if (this.smoothedAcceleration === 0) {
      this.smoothedAcceleration = rawAcceleration;
    } else {
      this.smoothedAcceleration = 
        this.accelerationSmoothing * rawAcceleration + 
        (1 - this.accelerationSmoothing) * this.smoothedAcceleration;
    }
    
    // If stationary, force acceleration to zero
    if (isStationary) {
      // Decay acceleration towards zero when stationary
      this.smoothedAcceleration = this.smoothedAcceleration * 0.7;
      if (Math.abs(this.smoothedAcceleration) < 0.1) {
        this.smoothedAcceleration = 0;
      }
    }
    
    // Filter out noise in acceleration (threshold in m/s²)
    if (Math.abs(this.smoothedAcceleration) < 0.2) {
      this.smoothedAcceleration = 0;
    }
    
    // Acceleration is already in m/s², no conversion needed
    const accelerationMs2 = this.smoothedAcceleration;
    
    // Calculate forces using Newton's Second Law
    const g = 9.81; // Gravitational acceleration (m/s²)
    const weight = this.config.mass * g; // Weight = mg (N)
    
    // Net force from acceleration: F_net = m × a
    // Positive acceleration (upward) = positive net force
    // Negative acceleration (downward) = negative net force
    const netForce = this.config.mass * accelerationMs2; // N
    
    // Total force = weight + net force
    // When jumping up: netForce > 0, totalForce > weight
    // When landing: netForce < 0, but impact can cause large positive acceleration
    const totalForce = weight + netForce; // N
    
    return {
      verticalVelocity: verticalVelocity, // m/s
      acceleration: accelerationMs2, // m/s²
      weight: weight, // N (force due to gravity)
      netForce: netForce, // N (force from acceleration, can be negative)
      totalForce: totalForce, // N (total force = weight + net force)
      mass: this.config.mass, // kg
      timestamp: poseData.timestamp,
    };
  }

  /**
   * Get current jump state
   * @returns {Object} Current jump state
   */
  getState() {
    return { ...this.jumpState };
  }

  /**
   * Reset jump state (preserves jump count)
   */
  resetJumpState() {
    this.jumpState.isJumping = false;
    this.jumpState.isInAir = false;
    this.jumpState.isLanding = false;
    this.jumpState.jumpStartTime = null;
    this.jumpState.takeoffTime = null;
    this.jumpState.peakHeight = null;
    this.jumpState.landingTime = null;
    this.jumpState.currentAirtime = 0;
    this.jumpState.peakLandingForce = null;
    // Don't reset jumpCount or lastJumpEndTime
  }

  /**
   * Reset jump detector state (full reset, including jump count)
   */
  reset() {
    this.jumpState = {
      isJumping: false,
      isInAir: false,
      isLanding: false,
      jumpStartTime: null,
      takeoffTime: null,
      peakHeight: null,
      landingTime: null,
      jumpCount: 0,
      lastJumpEndTime: 0,
      currentAirtime: 0,
      peakLandingForce: null,
    };
    this.previousPoseData = null;
    this.smoothedVelocity = 0;
    this.velocityHistory = [];
    this.heightHistory = [];
    this.smoothedAcceleration = 0;
  }
}

// Singleton instance
export const jumpDetector = new JumpDetector();
