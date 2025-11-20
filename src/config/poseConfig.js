// MediaPipe BlazePose GHUM Configuration
export const POSE_CONFIG = {
  // Using lite model for best performance with minimal jitter
  modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  // Heavy model (slower, more accurate) - uncomment if needed
  // modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  delegate: 'GPU', // WebGPU
  runningMode: 'VIDEO',
  numPoses: 1,
  // Higher confidence thresholds reduce jitter by filtering out uncertain detections
  // Higher values = more stable, less fluctuations
  minPoseDetectionConfidence: 0.8, // Higher = more stable, less false positives, less fluctuations
  minPosePresenceConfidence: 0.85, // Higher = more stable tracking, smoother values
  minTrackingConfidence: 0.85, // Higher = smoother tracking between frames, less value jumps
};

export const VIDEO_CONFIG = {
  // High resolution for better pose detection accuracy
  width: 640,
  height: 480, // 720p HD resolution
  frameRate: 60, // Target 60 FPS
};

export const PERFORMANCE_CONFIG = {
  // Frame skipping: process pose detection every N frames (1 = every frame, 2 = every other frame)
  // Higher values = better FPS but less frequent pose updates
  poseDetectionInterval: 1, // Lite model can handle every frame
  // Enable adaptive frame skipping to maintain minimum FPS
  enableAdaptiveFrameSkipping: true,
  // Minimum FPS threshold - system will adapt if FPS drops below this
  minFPS: 60,
  // Target FPS
  targetFPS: 60,
  // FPS check interval (ms) - how often to check and adapt
  fpsCheckInterval: 2000,
  // Maximum frame skip interval (safety limit)
  maxFrameSkipInterval: 3,
  // Aggressive mode: if FPS drops below this, skip more aggressively
  aggressiveThreshold: 40,
};

export const FPS_CONFIG = {
  updateInterval: 1000, // Update FPS every 1 second
};

export const SMOOTHING_CONFIG = {
  method: 'kalman', // Kalman filter provides better smoothing than EMA for reducing jitter
  alpha: 0.05, // Much lower alpha = much more smoothing (used as base for Kalman if method is EMA)
  landmarkSmoothing: 0.05, // Very low = very aggressive landmark smoothing (reduces jitter significantly)
  enabled: true,
  // Kalman filter tuning for much better smoothing (reduces fluctuations)
  kalmanProcessNoise: 0.0005, // Much lower = much more smoothing (less responsive to changes)
  kalmanMeasurementNoise: 0.35, // Higher = trust measurements less (more smoothing)
  // Separate Kalman parameters for angles (can be more aggressive)
  kalmanAngleProcessNoise: 0.0003, // Even lower for angles
  kalmanAngleMeasurementNoise: 0.4, // Higher for angles
};

