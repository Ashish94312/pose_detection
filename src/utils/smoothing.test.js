/**
 * Unit tests for smoothing utilities
 */

import {
  ExponentialMovingAverage,
  KalmanFilter,
  AngleSmoother,
  LandmarkSmoother,
} from './smoothing';

describe('ExponentialMovingAverage', () => {
  let ema;

  beforeEach(() => {
    ema = new ExponentialMovingAverage(0.5);
  });

  test('should initialize with null value', () => {
    expect(ema.value).toBe(null);
  });

  test('should set first value directly', () => {
    const result = ema.update(10);
    expect(result).toBe(10);
    expect(ema.value).toBe(10);
  });

  test('should smooth subsequent values', () => {
    ema.update(10);
    const result = ema.update(20);
    
    // With alpha=0.5: 0.5 * 20 + 0.5 * 10 = 15
    expect(result).toBe(15);
  });

  test('should handle different alpha values', () => {
    const highAlpha = new ExponentialMovingAverage(0.9);
    highAlpha.update(10);
    const result = highAlpha.update(20);
    
    // With alpha=0.9: 0.9 * 20 + 0.1 * 10 = 19
    expect(result).toBeCloseTo(19, 1);
  });

  test('should ignore null values', () => {
    ema.update(10);
    const result = ema.update(null);
    expect(result).toBe(null);
    expect(ema.value).toBe(10); // Should not change
  });

  test('should ignore NaN values', () => {
    ema.update(10);
    const result = ema.update(NaN);
    expect(result).toBe(null);
    expect(ema.value).toBe(10);
  });

  test('should reset value', () => {
    ema.update(10);
    ema.reset();
    expect(ema.value).toBe(null);
  });
});

describe('KalmanFilter', () => {
  let kalman;

  beforeEach(() => {
    kalman = new KalmanFilter(0.01, 0.25);
  });

  test('should initialize with null estimated value', () => {
    expect(kalman.estimatedValue).toBe(null);
  });

  test('should set first measurement directly', () => {
    const result = kalman.update(10);
    expect(result).toBe(10);
    expect(kalman.estimatedValue).toBe(10);
  });

  test('should filter subsequent measurements', () => {
    kalman.update(10);
    const result = kalman.update(20);
    
    // Should be between 10 and 20, closer to 10 due to filtering
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(20);
  });

  test('should ignore null values', () => {
    kalman.update(10);
    const result = kalman.update(null);
    expect(result).toBe(null);
    expect(kalman.estimatedValue).toBe(10);
  });

  test('should ignore NaN values', () => {
    kalman.update(10);
    const result = kalman.update(NaN);
    expect(result).toBe(null);
    expect(kalman.estimatedValue).toBe(10);
  });

  test('should reset filter', () => {
    kalman.update(10);
    kalman.reset();
    expect(kalman.estimatedValue).toBe(null);
    expect(kalman.estimatedError).toBe(1.0);
  });
});

describe('AngleSmoother', () => {
  let smoother;

  beforeEach(() => {
    smoother = new AngleSmoother('ema', 0.3);
  });

  test('should create EMA filter by default', () => {
    const filter = smoother.getFilter('test');
    expect(filter).toBeInstanceOf(ExponentialMovingAverage);
  });

  test('should create Kalman filter when specified', () => {
    const kalmanSmoother = new AngleSmoother('kalman', 0.3);
    const filter = kalmanSmoother.getFilter('test');
    expect(filter).toBeInstanceOf(KalmanFilter);
  });

  test('should reuse same filter for same key', () => {
    const filter1 = smoother.getFilter('leftElbow');
    const filter2 = smoother.getFilter('leftElbow');
    expect(filter1).toBe(filter2);
  });

  test('should smooth angles object', () => {
    const angles = {
      leftElbow: 90,
      rightElbow: 100,
      leftKnee: 120,
    };

    const smoothed = smoother.smoothAngles(angles);
    expect(smoothed).toHaveProperty('leftElbow');
    expect(smoothed).toHaveProperty('rightElbow');
    expect(smoothed).toHaveProperty('leftKnee');
  });

  test('should handle null angles', () => {
    const angles = {
      leftElbow: null,
      rightElbow: 100,
    };

    const smoothed = smoother.smoothAngles(angles);
    expect(smoothed.leftElbow).toBe(null);
    expect(smoothed.rightElbow).not.toBe(null);
  });

  test('should handle NaN angles', () => {
    const angles = {
      leftElbow: NaN,
      rightElbow: 100,
    };

    const smoothed = smoother.smoothAngles(angles);
    expect(smoothed.leftElbow).toBe(null);
  });

  test('should smooth orientations', () => {
    const orientations = {
      leftUpperArm: {
        x: 0.5,
        y: 0.5,
        z: 0.0,
        angle: 45,
        magnitude: 1.0,
      },
    };

    const smoothed = smoother.smoothOrientations(orientations);
    expect(smoothed).toHaveProperty('leftUpperArm');
    expect(smoothed.leftUpperArm).toHaveProperty('angle');
    expect(smoothed.leftUpperArm).toHaveProperty('x');
    expect(smoothed.leftUpperArm).toHaveProperty('y');
  });

  test('should handle null orientations', () => {
    const orientations = {
      leftUpperArm: null,
      rightUpperArm: { x: 0.5, y: 0.5, z: 0, angle: 45, magnitude: 1 },
    };

    const smoothed = smoother.smoothOrientations(orientations);
    expect(smoothed.leftUpperArm).toBe(null);
    expect(smoothed.rightUpperArm).not.toBe(null);
  });

  test('should reset all filters', () => {
    smoother.getFilter('test1');
    smoother.getFilter('test2');
    expect(Object.keys(smoother.filters).length).toBe(2);
    
    smoother.reset();
    expect(Object.keys(smoother.filters).length).toBe(0);
  });
});

describe('LandmarkSmoother', () => {
  let smoother;

  beforeEach(() => {
    smoother = new LandmarkSmoother(0.5, false);
  });

  test('should initialize smoothed landmarks on first call', () => {
    const landmarks = [
      { x: 0.5, y: 0.5, z: 0, visibility: 0.8 },
      { x: 0.6, y: 0.6, z: 0, visibility: 0.8 },
    ];

    const result = smoother.smooth(landmarks);
    expect(result).toEqual(landmarks); // First call returns original
  });

  test('should smooth landmarks using EMA', () => {
    const landmarks1 = [
      { x: 0.5, y: 0.5, z: 0, visibility: 0.8 },
    ];
    const landmarks2 = [
      { x: 1.0, y: 1.0, z: 0, visibility: 0.8 },
    ];

    smoother.smooth(landmarks1);
    const result = smoother.smooth(landmarks2);

    // With alpha=0.5: 0.5 * 1.0 + 0.5 * 0.5 = 0.75
    expect(result[0].x).toBeCloseTo(0.75, 2);
    expect(result[0].y).toBeCloseTo(0.75, 2);
  });

  test('should handle missing z coordinate', () => {
    const landmarks = [
      { x: 0.5, y: 0.5, visibility: 0.8 },
    ];

    smoother.smooth(landmarks);
    const result = smoother.smooth(landmarks);
    expect(result[0].z).toBe(0);
  });

  test('should preserve visibility', () => {
    const landmarks = [
      { x: 0.5, y: 0.5, z: 0, visibility: 0.8 },
    ];

    smoother.smooth(landmarks);
    const result = smoother.smooth(landmarks);
    expect(result[0].visibility).toBe(0.8);
  });

  test('should return empty array for empty input', () => {
    expect(smoother.smooth([])).toEqual([]);
  });

  test('should return null for null input', () => {
    expect(smoother.smooth(null)).toBe(null);
  });

  test('should reset smoothed landmarks', () => {
    const landmarks = [
      { x: 0.5, y: 0.5, z: 0, visibility: 0.8 },
    ];

    smoother.smooth(landmarks);
    smoother.reset();
    
    // After reset, should return original on next call
    const result = smoother.smooth(landmarks);
    expect(result).toEqual(landmarks);
  });

  test('should handle Kalman filtering', () => {
    const kalmanSmoother = new LandmarkSmoother(0.5, true);
    const landmarks1 = [
      { x: 0.5, y: 0.5, z: 0, visibility: 0.8 },
    ];
    const landmarks2 = [
      { x: 1.0, y: 1.0, z: 0, visibility: 0.8 },
    ];

    kalmanSmoother.smooth(landmarks1);
    const result = kalmanSmoother.smooth(landmarks2);

    // Kalman should smooth the value (may be exactly 1.0 in some cases)
    expect(result[0].x).toBeGreaterThanOrEqual(0.5);
    expect(result[0].x).toBeLessThanOrEqual(1.0);
    expect(result[0].y).toBeGreaterThanOrEqual(0.5);
    expect(result[0].y).toBeLessThanOrEqual(1.0);
  });
});

