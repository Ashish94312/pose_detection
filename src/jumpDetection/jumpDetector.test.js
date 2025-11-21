/**
 * Unit tests for JumpDetector
 */

import { JumpDetector } from './jumpDetector';
import { posePubSub } from '../utils/pubsub';
import { performanceProfiler } from '../utils/performanceProfiler';

// Mock dependencies
jest.mock('../utils/pubsub');
jest.mock('../utils/performanceProfiler');

describe('JumpDetector', () => {
  let detector;
  let mockUnsubscribe;
  let mockOnJumpDetected;
  let mockOnLandingDetected;
  let mockOnForceCalculated;

  beforeEach(() => {
    jest.clearAllMocks();
    
    detector = new JumpDetector();
    
    mockUnsubscribe = jest.fn();
    posePubSub.subscribe = jest.fn(() => mockUnsubscribe);
    posePubSub.getSubscriberCount = jest.fn(() => 1);
    
    performanceProfiler.start = jest.fn(() => 'timer-id');
    performanceProfiler.end = jest.fn();
    
    mockOnJumpDetected = jest.fn();
    mockOnLandingDetected = jest.fn();
    mockOnForceCalculated = jest.fn();
    
    detector.onJumpDetected = mockOnJumpDetected;
    detector.onLandingDetected = mockOnLandingDetected;
    detector.onForceCalculated = mockOnForceCalculated;
  });

  afterEach(() => {
    if (detector) {
      detector.unsubscribeFromFeed();
      detector.reset();
    }
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with correct default state', () => {
      expect(detector.fsmState).toBe('grounded');
      expect(detector.isSubscribed).toBe(false);
      expect(detector.jumpState.jumpCount).toBe(0);
      expect(detector.jumpState.currentJump).toBe(null);
      expect(detector.config.mass).toBe(70);
      expect(detector.config.takeoffVelocityThreshold).toBe(0.15);
    });

    test('should initialize with null scale factor', () => {
      expect(detector.config.normalizedToMeters).toBe(null);
    });

    test('should initialize with empty velocity and height histories', () => {
      expect(detector.velocityHistory).toEqual([]);
      expect(detector.heightHistory).toEqual([]);
      expect(detector.ankleYHistory).toEqual([]);
    });
  });

  describe('Mass Management', () => {
    test('should set valid mass', () => {
      detector.setMass(80);
      expect(detector.getMass()).toBe(80);
    });

    test('should reject mass <= 0', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      detector.setMass(0);
      expect(detector.getMass()).toBe(70);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should reject mass > 500', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      detector.setMass(600);
      expect(detector.getMass()).toBe(70);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Subscription Management', () => {
    test('should subscribe to pose data feed', () => {
      detector.subscribe();
      expect(posePubSub.subscribe).toHaveBeenCalled();
      expect(detector.isSubscribed).toBe(true);
    });

    test('should not subscribe twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      detector.subscribe();
      detector.subscribe();
      expect(posePubSub.subscribe).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should unsubscribe from pose data feed', () => {
      detector.subscribe();
      detector.unsubscribeFromFeed();
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(detector.isSubscribed).toBe(false);
    });
  });

  describe('Scale Factor Calculation', () => {
    test('should calculate scale from head-to-ankle distance', () => {
      const poseData = {
        joints: {
          nose: { x: 0.5, y: 0.2, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };

      const scaleInfo = detector.calculateScaleFactor(poseData);
      expect(scaleInfo).not.toBe(null);
      expect(scaleInfo.method).toBe('head-to-ankle');
      expect(scaleInfo.heightNormalized).toBeCloseTo(0.6, 1);
    });

    test('should calculate scale from shoulder-to-hip distance', () => {
      const poseData = {
        joints: {
          leftShoulder: { x: 0.4, y: 0.3, visible: true, visibility: 0.8 },
          rightShoulder: { x: 0.6, y: 0.3, visible: true, visibility: 0.8 },
          leftHip: { x: 0.4, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.6, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };

      const scaleInfo = detector.calculateScaleFactor(poseData);
      expect(scaleInfo).not.toBe(null);
      expect(scaleInfo.method).toBe('shoulder-to-hip');
    });

    test('should return null for invalid pose data', () => {
      expect(detector.calculateScaleFactor(null)).toBe(null);
      expect(detector.calculateScaleFactor({})).toBe(null);
    });

    test('should handle MoveNet visibility thresholds', () => {
      const poseData = {
        joints: {
          nose: { x: 0.5, y: 0.2, visible: true, visibility: 0.3 }, // MoveNet-like
          leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.3 },
          rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.3 },
        },
        timestamp: 1000,
      };

      const scaleInfo = detector.calculateScaleFactor(poseData);
      expect(scaleInfo).not.toBe(null);
    });
  });

  describe('Ankle Position Detection', () => {
    test('should get ankle Y when both ankles visible', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.9, visible: true, visibility: 0.8 },
      };

      const ankleData = detector.getAnkleY(joints);
      expect(ankleData).not.toBe(null);
      expect(ankleData.bothVisible).toBe(true);
      expect(ankleData.average).toBeCloseTo(0.85, 2);
    });

    test('should get ankle Y when only one ankle visible', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.9, visible: false, visibility: 0.1 },
      };

      const ankleData = detector.getAnkleY(joints);
      expect(ankleData).not.toBe(null);
      expect(ankleData.bothVisible).toBe(false);
      expect(ankleData.average).toBe(0.8);
    });

    test('should return null when no ankles visible', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: false, visibility: 0.1 },
        rightAnkle: { x: 0.6, y: 0.9, visible: false, visibility: 0.1 },
      };

      const ankleData = detector.getAnkleY(joints);
      expect(ankleData).toBe(null);
    });

    test('should handle MoveNet visibility thresholds', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.3 },
        rightAnkle: { x: 0.6, y: 0.9, visible: true, visibility: 0.3 },
      };

      const ankleData = detector.getAnkleY(joints);
      expect(ankleData).not.toBe(null);
      expect(ankleData.bothVisible).toBe(true);
    });
  });

  describe('Feet Off Ground Detection', () => {
    beforeEach(() => {
      detector.baselineAnkleY = 0.8;
      detector.ankleYHistory = [0.8, 0.8, 0.8, 0.8, 0.8];
      detector.warmupFrames = 15;
    });

    test('should detect both feet off ground', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.78, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.78, visible: true, visibility: 0.8 },
      };

      const result = detector.bothFeetAreOffGround(joints);
      expect(result).toBe(true);
    });

    test('should not detect jump if only one foot off ground', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.78, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.81, visible: true, visibility: 0.8 },
      };

      const result = detector.bothFeetAreOffGround(joints);
      expect(result).toBe(false);
    });

    test('should not detect jump during warm-up period', () => {
      detector.warmupFrames = 5;
      const joints = {
        leftAnkle: { x: 0.4, y: 0.78, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.78, visible: true, visibility: 0.8 },
      };

      const result = detector.bothFeetAreOffGround(joints);
      expect(result).toBe(false);
    });

    test('should not detect jump if baseline not stable', () => {
      detector.ankleYHistory = [0.8, 0.8];
      const joints = {
        leftAnkle: { x: 0.4, y: 0.78, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.78, visible: true, visibility: 0.8 },
      };

      const result = detector.bothFeetAreOffGround(joints);
      expect(result).toBe(false);
    });
  });

  describe('Baseline Ankle Height Update', () => {
    test('should update baseline when stationary', () => {
      detector.config.normalizedToMeters = 4.0;
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
      };

      detector.updateBaselineAnkleHeight(joints, 0.0);
      
      expect(detector.ankleYHistory.length).toBeGreaterThan(0);
    });

    test('should not update baseline when moving', () => {
      const initialLength = detector.ankleYHistory.length;
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
      };

      detector.config.normalizedToMeters = 4.0;
      detector.updateBaselineAnkleHeight(joints, 1.0);
      
      expect(detector.ankleYHistory.length).toBe(initialLength);
    });

    test('should track warm-up frames', () => {
      const joints = {
        leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
        rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
      };

      detector.updateBaselineAnkleHeight(joints, 0.0);
      
      expect(detector.bothAnklesVisibleHistory.length).toBeGreaterThan(0);
    });
  });

  describe('Vertical Velocity Calculation', () => {
    beforeEach(() => {
      detector.config.normalizedToMeters = 4.0;
      detector.previousPoseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };
    });

    test('should calculate upward velocity', () => {
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
        },
        timestamp: 1100, // 100ms later
      };

      const velocity = detector.calculateVerticalVelocity(poseData);
      expect(velocity).toBeGreaterThan(0);
    });

    test('should calculate downward velocity', () => {
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.6, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.6, visible: true, visibility: 0.8 },
        },
        timestamp: 1100,
      };

      const velocity = detector.calculateVerticalVelocity(poseData);
      expect(velocity).toBeLessThan(0);
    });

    test('should return zero velocity when no previous data', () => {
      detector.previousPoseData = null;
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };

      const velocity = detector.calculateVerticalVelocity(poseData);
      expect(velocity).toBe(0);
    });

    test('should filter out noise', () => {
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5001, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5001, visible: true, visibility: 0.8 },
        },
        timestamp: 1100,
      };

      const velocity = detector.calculateVerticalVelocity(poseData);
      expect(Math.abs(velocity)).toBeLessThan(0.1);
    });
  });

  describe('Force Calculation', () => {
    beforeEach(() => {
      detector.config.normalizedToMeters = 4.0;
      detector.config.mass = 70;
      detector.previousPoseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };
      detector.velocityHistory = [0, 0];
    });

    test('should calculate force when stationary', () => {
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1100,
      };

      const force = detector.calculateForce(poseData, 0);
      expect(force).not.toBe(null);
      expect(force.totalForce).toBeCloseTo(70 * 9.81, 0);
      expect(force.netForce).toBe(0);
    });

    test('should calculate force during acceleration', () => {
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
        },
        timestamp: 1100,
      };

      detector.velocityHistory = [0, 0.5];
      const force = detector.calculateForce(poseData, 1.0);
      expect(force).not.toBe(null);
      expect(force.totalForce).toBeGreaterThan(70 * 9.81);
    });

    test('should return null when no previous data', () => {
      detector.previousPoseData = null;
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };

      const force = detector.calculateForce(poseData, 0);
      expect(force).toBe(null);
    });
  });

  describe('FSM State Transitions', () => {
    beforeEach(() => {
      detector.config.normalizedToMeters = 4.0;
      detector.baselineAnkleY = 0.8;
      detector.ankleYHistory = [0.8, 0.8, 0.8, 0.8, 0.8];
      detector.warmupFrames = 15;
      detector.previousPoseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };
    });

    test('should transition from GROUNDED to TAKEOFF', () => {
      detector.upwardVelocityStartTime = 1000;
      
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.78, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.78, visible: true, visibility: 0.8 },
        },
        timestamp: 1030,
      };

      const verticalVelocity = 0.2;
      const hipCenter = { x: 0.5, y: 0.4, visible: true };
      const force = { totalForce: 800 };
      const timeInState = 100;

      if (detector.canTransitionToTakeoff(poseData, verticalVelocity, timeInState)) {
        detector.transitionToTakeoff(poseData, hipCenter);
      }

      expect(detector.fsmState).toBe('takeoff');
      expect(mockOnJumpDetected).toHaveBeenCalled();
    });

    test('should transition from TAKEOFF to AIRBORNE', () => {
      detector.fsmState = 'takeoff';
      detector.stateEntryTime = 1000;
      detector.jumpState.currentJump = {
        takeoffTime: 1000,
        takeoffHeight: 0.5,
        peakHeight: null,
      };

      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.4, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.78, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.78, visible: true, visibility: 0.8 },
        },
        timestamp: 1100,
      };

      const verticalVelocity = 0.03;
      const hipCenter = { x: 0.5, y: 0.4, visible: true };
      const force = { totalForce: 800 };
      const timeInState = 100;

      if (detector.canTransitionToAirborne(poseData, verticalVelocity, timeInState)) {
        detector.transitionToAirborne(poseData, hipCenter);
      }

      expect(detector.fsmState).toBe('airborne');
    });

    test('should transition from AIRBORNE to LANDING', () => {
      detector.fsmState = 'airborne';
      detector.stateEntryTime = 1000;
      detector.jumpState.currentJump = {
        takeoffTime: 1000,
        takeoffHeight: 0.5,
        peakHeight: 0.3,
      };

      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
        },
        timestamp: 1200,
      };

      const verticalVelocity = -0.15;
      const hipCenter = { x: 0.5, y: 0.5, visible: true };
      const force = { totalForce: 800 };
      const timeInState = 200;

      if (detector.canTransitionToLanding(poseData, verticalVelocity, timeInState)) {
        detector.transitionToLanding(poseData);
      }

      expect(detector.fsmState).toBe('landing');
    });

    test('should transition from LANDING to GROUNDED', () => {
      detector.fsmState = 'landing';
      detector.stateEntryTime = 1000;
      detector.jumpState.currentJump = {
        takeoffTime: 900,
        landingTime: 1000,
        takeoffHeight: 0.5,
        peakHeight: 0.3,
      };

      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1100,
      };

      detector.previousPoseData = poseData;
      detector.hipVelocityStableStartTime = 1050;

      const verticalVelocity = 0.01;
      const hipCenter = { x: 0.5, y: 0.5, visible: true };
      const force = { totalForce: 70 * 9.81 };
      const timeInState = 100;

      if (detector.canTransitionToGrounded(poseData, verticalVelocity, timeInState)) {
        detector.transitionToGrounded('Landing complete');
      }

      expect(detector.fsmState).toBe('grounded');
      expect(mockOnLandingDetected).toHaveBeenCalled();
    });
  });

  describe('Jump Validation', () => {
    beforeEach(() => {
      detector.config.normalizedToMeters = 4.0;
      detector.config.minJumpHeightNormalized = 0.03;
      detector.config.minAirborneTime = 80;
      detector.previousPoseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1200,
      };
    });

    test('should validate jump with sufficient height and airtime', () => {
      detector.fsmState = 'landing';
      detector.jumpState.currentJump = {
        takeoffTime: 1000,
        landingTime: 1200,
        takeoffHeight: 0.5,
        peakHeight: 0.4,
        peakGRF: null,
      };

      const previousCount = detector.jumpState.jumpCount;
      detector.transitionToGrounded('Landing complete');
      
      expect(detector.jumpState.jumpCount).toBe(previousCount + 1);
      expect(mockOnLandingDetected).toHaveBeenCalled();
    });

    test('should reject jump with insufficient height', () => {
      detector.fsmState = 'landing';
      detector.jumpState.currentJump = {
        takeoffTime: 1000,
        landingTime: 1100,
        takeoffHeight: 0.5,
        peakHeight: 0.49,
        peakGRF: null,
      };

      const previousCount = detector.jumpState.jumpCount;
      detector.transitionToGrounded('Landing complete');
      
      expect(detector.jumpState.jumpCount).toBe(previousCount);
      expect(mockOnLandingDetected).toHaveBeenCalled();
    });

    test('should validate jump with long airtime even if height is small', () => {
      detector.fsmState = 'landing';
      detector.jumpState.currentJump = {
        takeoffTime: 1000,
        landingTime: 1600,
        takeoffHeight: 0.5,
        peakHeight: 0.49,
        peakGRF: null,
      };

      const previousCount = detector.jumpState.jumpCount;
      detector.transitionToGrounded('Landing complete');
      
      expect(detector.jumpState.jumpCount).toBe(previousCount + 1);
    });
  });

  describe('State Getter', () => {
    test('should return correct state when grounded', () => {
      detector.fsmState = 'grounded';
      const state = detector.getState();
      
      expect(state.fsmState).toBe('grounded');
      expect(state.isJumping).toBe(false);
      expect(state.isInAir).toBe(false);
      expect(state.isLanding).toBe(false);
    });

    test('should return correct state when in takeoff', () => {
      detector.fsmState = 'takeoff';
      detector.jumpState.currentJump = {
        takeoffTime: 1000,
      };
      detector.previousPoseData = { timestamp: 1100 };
      
      const state = detector.getState();
      expect(state.isJumping).toBe(true);
      expect(state.currentAirtime).toBe(100);
    });
  });

  describe('Reset Functionality', () => {
    test('should reset all state', () => {
      detector.fsmState = 'airborne';
      detector.jumpState.jumpCount = 5;
      detector.smoothedVelocity = 1.0;
      detector.baselineHipHeight = 0.5;
      detector.baselineAnkleY = 0.8;
      
      detector.reset();
      
      expect(detector.fsmState).toBe('grounded');
      expect(detector.jumpState.jumpCount).toBe(0);
      expect(detector.smoothedVelocity).toBe(0);
      expect(detector.baselineHipHeight).toBe(null);
      expect(detector.baselineAnkleY).toBe(null);
    });
  });

  describe('Hip Center Calculation', () => {
    test('should calculate hip center from both hips', () => {
      const joints = {
        leftHip: { x: 0.4, y: 0.5, z: 0.0, visible: true, visibility: 0.8 },
        rightHip: { x: 0.6, y: 0.5, z: 0.0, visible: true, visibility: 0.8 },
      };

      const hipCenter = detector.getHipCenter(joints);
      expect(hipCenter).not.toBe(null);
      expect(hipCenter.x).toBe(0.5);
      expect(hipCenter.y).toBe(0.5);
    });

    test('should return null when hips not visible', () => {
      const joints = {
        leftHip: { x: 0.4, y: 0.5, visible: false, visibility: 0.1 },
        rightHip: { x: 0.6, y: 0.5, visible: false, visibility: 0.1 },
      };

      const hipCenter = detector.getHipCenter(joints);
      expect(hipCenter).toBe(null);
    });

    test('should handle MoveNet visibility thresholds', () => {
      const joints = {
        leftHip: { x: 0.4, y: 0.5, visible: true, visibility: 0.3 },
        rightHip: { x: 0.6, y: 0.5, visible: true, visibility: 0.3 },
      };

      const hipCenter = detector.getHipCenter(joints);
      expect(hipCenter).not.toBe(null);
    });
  });

  describe('Process Pose Data', () => {
    test('should skip invalid pose data', () => {
      detector.processPoseData(null);
      detector.processPoseData({});
      detector.processPoseData({ joints: null });
      
      expect(detector.previousPoseData).toBe(null);
    });

    test('should initialize on first valid pose data', () => {
      const poseData = {
        joints: {
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };

      detector.processPoseData(poseData);
      expect(detector.previousPoseData).toEqual(poseData);
    });

    test('should calculate scale factor when not set', () => {
      const poseData = {
        joints: {
          nose: { x: 0.5, y: 0.2, visible: true, visibility: 0.8 },
          leftAnkle: { x: 0.4, y: 0.8, visible: true, visibility: 0.8 },
          rightAnkle: { x: 0.6, y: 0.8, visible: true, visibility: 0.8 },
          leftHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
          rightHip: { x: 0.5, y: 0.5, visible: true, visibility: 0.8 },
        },
        timestamp: 1000,
      };

      for (let i = 0; i < 15; i++) {
        detector.processPoseData({ ...poseData, timestamp: 1000 + i * 100 });
      }

      expect(detector.config.normalizedToMeters).not.toBe(null);
    });
  });
});

