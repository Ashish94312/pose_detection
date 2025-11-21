/**
 * Unit tests for poseAngles utilities
 */

import {
  distance2D,
  distance3D,
  isLandmarkVisible,
  calculateAngle,
  calculateSegmentOrientation,
  calculateAllAngles,
  calculateAllOrientations,
  MOVENET_LANDMARK_INDICES,
  BLAZEPOSE_LANDMARK_INDICES,
} from './poseAngles';

describe('poseAngles Utilities', () => {
  describe('distance2D', () => {
    test('should calculate 2D distance correctly', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      
      expect(distance2D(p1, p2)).toBe(5); // 3-4-5 triangle
    });

    test('should handle negative coordinates', () => {
      const p1 = { x: -1, y: -1 };
      const p2 = { x: 2, y: 3 };
      
      expect(distance2D(p1, p2)).toBeCloseTo(5, 5);
    });

    test('should return 0 for same point', () => {
      const p1 = { x: 5, y: 5 };
      const p2 = { x: 5, y: 5 };
      
      expect(distance2D(p1, p2)).toBe(0);
    });
  });

  describe('distance3D', () => {
    test('should calculate 3D distance correctly', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 3, y: 4, z: 0 };
      
      expect(distance3D(p1, p2)).toBe(5);
    });

    test('should handle z coordinate', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 0, y: 0, z: 5 };
      
      expect(distance3D(p1, p2)).toBe(5);
    });

    test('should handle missing z coordinate', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      
      expect(distance3D(p1, p2)).toBe(5);
    });
  });

  describe('isLandmarkVisible', () => {
    test('should return true for visible landmark', () => {
      const landmark = { x: 0.5, y: 0.5, visibility: 0.8 };
      expect(isLandmarkVisible(landmark)).toBe(true);
    });

    test('should return false for low visibility', () => {
      const landmark = { x: 0.5, y: 0.5, visibility: 0.2 };
      expect(isLandmarkVisible(landmark, 0.3)).toBe(false);
    });

    test('should return false for null landmark', () => {
      expect(isLandmarkVisible(null)).toBe(false);
    });

    test('should return false for NaN coordinates', () => {
      const landmark = { x: NaN, y: 0.5, visibility: 0.8 };
      expect(isLandmarkVisible(landmark)).toBe(false);
    });

    test('should return false for undefined coordinates', () => {
      const landmark = { visibility: 0.8 };
      expect(isLandmarkVisible(landmark)).toBe(false);
    });

    test('should default visibility to 1.0 if not provided', () => {
      const landmark = { x: 0.5, y: 0.5 };
      expect(isLandmarkVisible(landmark, 0.5)).toBe(true);
    });
  });

  describe('calculateAngle', () => {
    test('should calculate 90 degree angle', () => {
      const p1 = { x: 0, y: 0, visible: true, visibility: 0.8 };
      const p2 = { x: 0, y: 1, visible: true, visibility: 0.8 };
      const p3 = { x: 1, y: 1, visible: true, visibility: 0.8 };
      
      const angle = calculateAngle(p1, p2, p3);
      expect(angle).toBeCloseTo(90, 1);
    });

    test('should calculate 180 degree angle (straight line)', () => {
      const p1 = { x: 0, y: 0, visible: true, visibility: 0.8 };
      const p2 = { x: 0.5, y: 0.5, visible: true, visibility: 0.8 };
      const p3 = { x: 1, y: 1, visible: true, visibility: 0.8 };
      
      const angle = calculateAngle(p1, p2, p3);
      expect(angle).toBeCloseTo(180, 1);
    });

    test('should return null for invisible landmarks', () => {
      const p1 = { x: 0, y: 0, visible: false, visibility: 0.1 };
      const p2 = { x: 0.5, y: 0.5, visible: true, visibility: 0.8 };
      const p3 = { x: 1, y: 1, visible: true, visibility: 0.8 };
      
      expect(calculateAngle(p1, p2, p3)).toBe(null);
    });

    test('should return null for points too close together', () => {
      const p1 = { x: 0, y: 0, visible: true, visibility: 0.8 };
      const p2 = { x: 0.001, y: 0.001, visible: true, visibility: 0.8 };
      const p3 = { x: 0.002, y: 0.002, visible: true, visibility: 0.8 };
      
      expect(calculateAngle(p1, p2, p3)).toBe(null);
    });

    test('should handle 3D coordinates', () => {
      const p1 = { x: 0, y: 0, z: 0, visible: true, visibility: 0.8 };
      const p2 = { x: 0, y: 1, z: 0, visible: true, visibility: 0.8 };
      const p3 = { x: 1, y: 1, z: 1, visible: true, visibility: 0.8 };
      
      const angle = calculateAngle(p1, p2, p3);
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThanOrEqual(180);
    });
  });

  describe('calculateSegmentOrientation', () => {
    test('should calculate orientation for vertical segment', () => {
      const p1 = { x: 0.5, y: 0.0, visible: true, visibility: 0.8 };
      const p2 = { x: 0.5, y: 1.0, visible: true, visibility: 0.8 };
      
      const orientation = calculateSegmentOrientation(p1, p2);
      expect(orientation).not.toBe(null);
      expect(orientation.magnitude).toBeCloseTo(1.0, 2);
    });

    test('should calculate orientation for horizontal segment', () => {
      const p1 = { x: 0.0, y: 0.5, visible: true, visibility: 0.8 };
      const p2 = { x: 1.0, y: 0.5, visible: true, visibility: 0.8 };
      
      const orientation = calculateSegmentOrientation(p1, p2);
      expect(orientation).not.toBe(null);
      expect(orientation.angle).toBeCloseTo(90, 1);
    });

    test('should return null for invisible landmarks', () => {
      const p1 = { x: 0, y: 0, visible: false, visibility: 0.1 };
      const p2 = { x: 1, y: 1, visible: true, visibility: 0.8 };
      
      expect(calculateSegmentOrientation(p1, p2)).toBe(null);
    });

    test('should return null for points too close', () => {
      const p1 = { x: 0, y: 0, visible: true, visibility: 0.8 };
      const p2 = { x: 0.001, y: 0.001, visible: true, visibility: 0.8 };
      
      expect(calculateSegmentOrientation(p1, p2)).toBe(null);
    });

    test('should include angle in result', () => {
      const p1 = { x: 0, y: 0, visible: true, visibility: 0.8 };
      const p2 = { x: 1, y: 1, visible: true, visibility: 0.8 };
      
      const orientation = calculateSegmentOrientation(p1, p2);
      expect(orientation).toHaveProperty('angle');
      expect(typeof orientation.angle).toBe('number');
    });
  });

  describe('calculateAllAngles', () => {
    test('should return null for insufficient landmarks', () => {
      expect(calculateAllAngles([])).toBe(null);
      expect(calculateAllAngles(new Array(10))).toBe(null);
    });

    test('should calculate angles for MoveNet landmarks (17 keypoints)', () => {
      const landmarks = new Array(17).fill(null).map((_, i) => ({
        x: 0.5,
        y: 0.5 + i * 0.01,
        visible: true,
        visibility: 0.8,
      }));

      const angles = calculateAllAngles(landmarks);
      expect(angles).not.toBe(null);
      expect(angles).toHaveProperty('leftShoulder');
      expect(angles).toHaveProperty('leftElbow');
      expect(angles).toHaveProperty('rightShoulder');
      expect(angles).toHaveProperty('rightElbow');
      expect(angles).toHaveProperty('leftHip');
      expect(angles).toHaveProperty('leftKnee');
      expect(angles).toHaveProperty('rightHip');
      expect(angles).toHaveProperty('rightKnee');
      expect(angles).toHaveProperty('torso');
    });

    test('should calculate angles for BlazePose landmarks (33 keypoints)', () => {
      const landmarks = new Array(33).fill(null).map((_, i) => ({
        x: 0.5,
        y: 0.5 + i * 0.01,
        visible: true,
        visibility: 0.8,
      }));

      const angles = calculateAllAngles(landmarks);
      expect(angles).not.toBe(null);
      expect(angles).toHaveProperty('leftShoulder');
      expect(angles).toHaveProperty('torso');
    });

    test('should return null angles for invisible landmarks', () => {
      const landmarks = new Array(17).fill(null).map(() => ({
        x: 0.5,
        y: 0.5,
        visible: false,
        visibility: 0.1,
      }));

      const angles = calculateAllAngles(landmarks);
      expect(angles).not.toBe(null);
      // All angles should be null when landmarks are invisible
      expect(angles.leftShoulder).toBe(null);
    });
  });

  describe('calculateAllOrientations', () => {
    test('should return null for insufficient landmarks', () => {
      expect(calculateAllOrientations([])).toBe(null);
    });

    test('should calculate orientations for MoveNet landmarks', () => {
      const landmarks = new Array(17).fill(null).map((_, i) => ({
        x: 0.5,
        y: 0.5 + i * 0.01,
        visible: true,
        visibility: 0.8,
      }));

      const orientations = calculateAllOrientations(landmarks);
      expect(orientations).not.toBe(null);
      expect(orientations).toHaveProperty('leftUpperArm');
      expect(orientations).toHaveProperty('rightUpperArm');
      expect(orientations).toHaveProperty('leftThigh');
      expect(orientations).toHaveProperty('torso');
    });

    test('should return null orientations for invisible landmarks', () => {
      const landmarks = new Array(17).fill(null).map(() => ({
        x: 0.5,
        y: 0.5,
        visible: false,
        visibility: 0.1,
      }));

      const orientations = calculateAllOrientations(landmarks);
      expect(orientations).not.toBe(null);
      expect(orientations.leftUpperArm).toBe(null);
    });
  });

  describe('Landmark Indices', () => {
    test('should have correct MoveNet indices', () => {
      expect(MOVENET_LANDMARK_INDICES.NOSE).toBe(0);
      expect(MOVENET_LANDMARK_INDICES.LEFT_ANKLE).toBe(15);
      expect(MOVENET_LANDMARK_INDICES.RIGHT_ANKLE).toBe(16);
    });

    test('should have correct BlazePose indices', () => {
      expect(BLAZEPOSE_LANDMARK_INDICES.NOSE).toBe(0);
      expect(BLAZEPOSE_LANDMARK_INDICES.LEFT_ANKLE).toBe(27);
      expect(BLAZEPOSE_LANDMARK_INDICES.RIGHT_ANKLE).toBe(28);
    });
  });
});

