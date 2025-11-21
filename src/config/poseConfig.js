// Multi-Model Pose Detection Configuration
// Supported models: 'blazepose' | 'movenet'

// Default model selection
export const DEFAULT_MODEL = 'blazepose'; // 'blazepose' or 'movenet'

// BlazePose Configuration (MediaPipe)
export const BLAZEPOSE_CONFIG = {
  modelType: 'blazepose',
  // Using lite model for best performance with minimal jitter
  // modelAssetPath: '/models/pose_landmarker_lite.task',
  // Heavy model (slower, more accurate) - uncomment if needed
  modelAssetPath: '/models/pose_landmarker_heavy.task',
  wasmPath: '/wasm',
  delegate: 'GPU', // WebGPU
  runningMode: 'VIDEO',
  numPoses: 1,
  // Maximum confidence thresholds for zero jitter - only accept very confident detections
  // Higher values = more stable, less fluctuations, zero jitter
  minPoseDetectionConfidence: 0.85, // Very high = only accept highly confident detections
  minPosePresenceConfidence: 0.9, // Very high = stable tracking, no flickering
  minTrackingConfidence: 0.9, // Very high = smooth tracking between frames, zero jumps
  // Web Worker configuration
  // Note: Worker support requires webpack configuration to bundle MediaPipe
  // For now, default to false (main thread) until proper worker setup is configured
  useWorker: false, // Set to true to use Web Worker (requires webpack worker-loader or similar)
};

// MoveNet Lightning Configuration (TensorFlow.js)
export const MOVENET_CONFIG = {
  modelType: 'movenet',
  modelUrl: 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4', // MoveNet Lightning v4
  wasmPath: '/wasm', // Not used by MoveNet, but kept for consistency
  delegate: 'GPU', // Not used by MoveNet, but kept for consistency
  runningMode: 'VIDEO', // Not used by MoveNet, but kept for consistency
  numPoses: 1,
  // MoveNet confidence thresholds
  minPoseScore: 0.25, // Minimum confidence for pose detection
  minKeypointScore: 0.3, // Minimum confidence for individual keypoints
};

// Unified POSE_CONFIG - will be set based on selected model
export const POSE_CONFIG = BLAZEPOSE_CONFIG;

/**
 * Get configuration for a specific model type
 * @param {string} modelType - 'blazepose' or 'movenet'
 * @returns {Object} Model configuration
 */
export const getModelConfig = (modelType) => {
  switch (modelType?.toLowerCase()) {
    case 'movenet':
    case 'movenet-lightning':
      return MOVENET_CONFIG;
    case 'blazepose':
    default:
      return BLAZEPOSE_CONFIG;
  }
};

export const VIDEO_CONFIG = {
  // High resolution for better pose detection accuracy
  width: 640,
  height: 480, // 720p HD resolution
  frameRate: 60, // Target 60 FPS
};

// Available resolution presets
export const RESOLUTION_PRESETS = [
  { label: '320x240 (QVGA)', width: 320, height: 240 },
  { label: '640x480 (VGA)', width: 640, height: 480 },
];

// Default resolution
export const DEFAULT_RESOLUTION = RESOLUTION_PRESETS[1]; // 640x480

/**
 * Get resolution config by label
 * @param {string} label - Resolution label (e.g., '640x480 (VGA)')
 * @returns {Object} Resolution config with width and height
 */
export const getResolutionConfig = (label) => {
  return RESOLUTION_PRESETS.find(preset => preset.label === label) || DEFAULT_RESOLUTION;
};

export const PERFORMANCE_CONFIG = {
  // GAME MODE: Process EVERY frame - no skipping for maximum jump detection accuracy
  // Frame skipping: process pose detection every N frames (1 = every frame, 2 = every other frame)
  // Higher values = better FPS but less frequent pose updates
  poseDetectionInterval: 1, // Process EVERY frame - no skipping
  // DISABLED: Adaptive frame skipping - we want to process every frame
  enableAdaptiveFrameSkipping: false, // Disabled to process all frames
  // GAME MODE: Accept lower FPS to ensure every frame is processed
  // Minimum FPS threshold - system will adapt if FPS drops below this (but we disabled adaptive skipping)
  minFPS: 30, // Accept lower FPS to prioritize processing every frame
  // Target FPS
  targetFPS: 60,
  // FPS check interval (ms) - how often to check and adapt (not used when adaptive skipping is disabled)
  fpsCheckInterval: 2000,
  // Maximum frame skip interval (safety limit) - not used when adaptive skipping is disabled
  maxFrameSkipInterval: 1, // Set to 1 (no skipping) since we disabled adaptive skipping
  // Aggressive mode: if FPS drops below this, skip more aggressively (not used when disabled)
  aggressiveThreshold: 20, // Not used but kept for reference
};

export const FPS_CONFIG = {
  updateInterval: 1000, // Update FPS every 1 second
};

export const SMOOTHING_CONFIG = {
  method: 'kalman', // Kalman filter for angles - best for jitter elimination
  alpha: 0.4, // Lower alpha = more smoothing, less jitter
  landmarkSmoothing: 0.9, // Higher = less smoothing, more responsive (reduced from 0.75 for lower latency)
  landmarkSmoothingMethod: 'ema', // Use EMA for landmarks - faster and lower latency than Kalman
  enabled: true,
  // Kalman filter tuning for maximum smoothness and zero jitter
  kalmanProcessNoise: 0.01, // Lower = smoother, less responsive to noise (eliminates jitter)
  kalmanMeasurementNoise: 0.25, // Higher = trust measurements less, smooth more (reduces jitter)
  // Separate Kalman parameters for angles - optimized for stability
  kalmanAngleProcessNoise: 0.0001, // Very low = very smooth angles, no jitter
  kalmanAngleMeasurementNoise: 0.5, // Higher = more smoothing, eliminates angle jitter
  // Option to disable landmark smoothing for drawing (for maximum responsiveness)
  smoothLandmarksForDrawing: false, // Set to false to draw raw landmarks immediately
};

export const SKETCH_CONFIG = {
  connectionColor: '#00E5FF', // Electric cyan for pose skeleton connections - maximum visibility on any background
  connectionWidth: 2.5, // Slightly thicker lines for better visibility
  landmarkColor: '#FFD700', // Bright gold/yellow for pose landmarks/joints - highly visible and professional
  landmarkRadius: 4, // Slightly larger radius for better visibility
  landmarkStrokeColor: '#000000', // Black outline for landmarks to ensure visibility on light backgrounds
  landmarkStrokeWidth: 1, // Outline width for landmarks
};

