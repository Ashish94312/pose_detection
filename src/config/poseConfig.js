// MediaPipe BlazePose GHUM Configuration
export const POSE_CONFIG = {
  // Using lite model for better performance (60+ FPS target)
  modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  // Heavy model (slower, more accurate) - uncomment if needed
  // modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  delegate: 'GPU', // WebGPU
  runningMode: 'VIDEO',
  numPoses: 1,
  // Increased confidence thresholds to reduce jitter
  minPoseDetectionConfidence: 0.7,
  minPosePresenceConfidence: 0.7,
  minTrackingConfidence: 0.7,
};

export const VIDEO_CONFIG = {
  // Reduced resolution for better FPS (can increase if GPU is powerful)
  width: 640,
  height: 480,
  // For 60+ FPS, consider: width: 480, height: 360
};

export const FPS_CONFIG = {
  updateInterval: 1000, // Update FPS every 1 second
};

export const SMOOTHING_CONFIG = {
  method: 'ema', // 'ema' or 'kalman'
  alpha: 0.4, // Smoothing factor for EMA (0-1, lower = more smoothing)
  landmarkSmoothing: 0.5, // Smoothing for landmarks
  enabled: true,
};

