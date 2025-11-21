import { SKETCH_CONFIG } from '../config/poseConfig';
import { MOVENET_LANDMARK_INDICES, BLAZEPOSE_LANDMARK_INDICES } from './poseAngles';

// MoveNet Lightning connections (17 keypoints)
// Standard MoveNet skeleton structure
const MOVENET_CONNECTIONS = [
  // Face/Head
  [MOVENET_LANDMARK_INDICES.LEFT_EYE, MOVENET_LANDMARK_INDICES.NOSE],
  [MOVENET_LANDMARK_INDICES.RIGHT_EYE, MOVENET_LANDMARK_INDICES.NOSE],
  [MOVENET_LANDMARK_INDICES.LEFT_EAR, MOVENET_LANDMARK_INDICES.LEFT_EYE],
  [MOVENET_LANDMARK_INDICES.RIGHT_EAR, MOVENET_LANDMARK_INDICES.RIGHT_EYE],
  // Head to shoulders (torso)
  [MOVENET_LANDMARK_INDICES.NOSE, MOVENET_LANDMARK_INDICES.LEFT_SHOULDER],
  [MOVENET_LANDMARK_INDICES.NOSE, MOVENET_LANDMARK_INDICES.RIGHT_SHOULDER],
  // Upper body
  [MOVENET_LANDMARK_INDICES.LEFT_SHOULDER, MOVENET_LANDMARK_INDICES.RIGHT_SHOULDER], // Connect shoulders
  [MOVENET_LANDMARK_INDICES.LEFT_SHOULDER, MOVENET_LANDMARK_INDICES.LEFT_ELBOW],
  [MOVENET_LANDMARK_INDICES.LEFT_ELBOW, MOVENET_LANDMARK_INDICES.LEFT_WRIST],
  [MOVENET_LANDMARK_INDICES.RIGHT_SHOULDER, MOVENET_LANDMARK_INDICES.RIGHT_ELBOW],
  [MOVENET_LANDMARK_INDICES.RIGHT_ELBOW, MOVENET_LANDMARK_INDICES.RIGHT_WRIST],
  // Torso
  [MOVENET_LANDMARK_INDICES.LEFT_SHOULDER, MOVENET_LANDMARK_INDICES.LEFT_HIP],
  [MOVENET_LANDMARK_INDICES.RIGHT_SHOULDER, MOVENET_LANDMARK_INDICES.RIGHT_HIP],
  // Lower body
  [MOVENET_LANDMARK_INDICES.LEFT_HIP, MOVENET_LANDMARK_INDICES.RIGHT_HIP], // Connect hips
  [MOVENET_LANDMARK_INDICES.LEFT_HIP, MOVENET_LANDMARK_INDICES.LEFT_KNEE],
  [MOVENET_LANDMARK_INDICES.LEFT_KNEE, MOVENET_LANDMARK_INDICES.LEFT_ANKLE],
  [MOVENET_LANDMARK_INDICES.RIGHT_HIP, MOVENET_LANDMARK_INDICES.RIGHT_KNEE],
  [MOVENET_LANDMARK_INDICES.RIGHT_KNEE, MOVENET_LANDMARK_INDICES.RIGHT_ANKLE],
];

// BlazePose connections (33 keypoints)
const BLAZEPOSE_CONNECTIONS = [
  // Face
  [10, 9], [9, 0], [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  // Upper body
  [12, 11], // Connect shoulders
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], // Left arm: shoulder -> elbow -> wrist -> fingers
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], // Right arm: shoulder -> elbow -> wrist -> fingers
  [12, 24], [11, 23], // Shoulders to hips
  // Lower body
  [24, 26], [26, 28], [28, 30], [28, 32],
  [23, 25], [25, 27], [27, 29], [27, 31],
  // Torso
  [24, 23]
];

// Default to BlazePose for backward compatibility
export const POSE_CONNECTIONS = BLAZEPOSE_CONNECTIONS;

/**
 * Get pose connections based on number of landmarks (model type)
 * @param {number} landmarkCount - Number of landmarks
 * @returns {Array} Array of connection pairs
 */
export const getPoseConnections = (landmarkCount) => {
  if (landmarkCount === 17) {
    return MOVENET_CONNECTIONS;
  } else if (landmarkCount === 33) {
    return BLAZEPOSE_CONNECTIONS;
  }
  // Default to BlazePose
  return BLAZEPOSE_CONNECTIONS;
};

// Use sketch config from product-level configuration
export const DRAWING_STYLES = {
  connectionColor: SKETCH_CONFIG.connectionColor,
  connectionWidth: SKETCH_CONFIG.connectionWidth,
  landmarkColor: SKETCH_CONFIG.landmarkColor,
  landmarkRadius: SKETCH_CONFIG.landmarkRadius,
  landmarkStrokeColor: SKETCH_CONFIG.landmarkStrokeColor || '#000000',
  landmarkStrokeWidth: SKETCH_CONFIG.landmarkStrokeWidth || 1,
};

/**
 * Get visibility threshold based on model type
 * MoveNet uses lower confidence scores, so we use a lower threshold
 * @param {number} landmarkCount - Number of landmarks (17 for MoveNet, 33 for BlazePose)
 * @returns {number} Visibility threshold
 */
const getVisibilityThreshold = (landmarkCount) => {
  // MoveNet (17 keypoints) typically has lower confidence scores
  // BlazePose (33 keypoints) has higher visibility scores
  return landmarkCount === 17 ? 0.25 : 0.5;
};

/**
 * Draws pose landmarks and connections on canvas
 * Note: Does not clear the canvas - assumes video frame is already drawn
 * @param {Array} landmarks - Array of pose landmarks
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 */
export const drawPose = (landmarks, canvas, ctx) => {
  if (!landmarks || landmarks.length === 0) {
    return;
  }

  // Save context state to avoid affecting other drawing operations
  ctx.save();

  // Get model-specific connections and visibility threshold
  const connections = getPoseConnections(landmarks.length);
  const visibilityThreshold = getVisibilityThreshold(landmarks.length);

  // Draw connections - optimized batch drawing
  ctx.strokeStyle = DRAWING_STYLES.connectionColor;
  ctx.lineWidth = DRAWING_STYLES.connectionWidth;
  
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const connectionsLength = connections.length;

  // Batch draw connections for better performance
  ctx.beginPath();
  let hasPaths = false;
  
  for (let i = 0; i < connectionsLength; i++) {
    const [start, end] = connections[i];
    const startLandmark = landmarks[start];
    const endLandmark = landmarks[end];
    
    if (!startLandmark || !endLandmark) continue;
    
    // Check if landmarks are visible
    // Use model-specific threshold, or default to drawing if visibility is undefined
    const startVisible = startLandmark.visibility === undefined || 
                         startLandmark.visibility >= visibilityThreshold;
    const endVisible = endLandmark.visibility === undefined || 
                       endLandmark.visibility >= visibilityThreshold;
    
    if (startVisible && endVisible) {
      // Validate coordinates are valid numbers
      const startX = startLandmark.x * canvasWidth;
      const startY = startLandmark.y * canvasHeight;
      const endX = endLandmark.x * canvasWidth;
      const endY = endLandmark.y * canvasHeight;
      
      if (!isNaN(startX) && !isNaN(startY) && !isNaN(endX) && !isNaN(endY)) {
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        hasPaths = true;
      }
    }
  }
  
  if (hasPaths) {
    ctx.stroke();
  }

  // Draw landmarks with stroke outline for better visibility - optimized batch drawing
  const landmarksLength = landmarks.length;
  const radius = DRAWING_STYLES.landmarkRadius;
  const twoPI = 2 * Math.PI;
  
  // Batch draw strokes first, then fills
  ctx.strokeStyle = DRAWING_STYLES.landmarkStrokeColor;
  ctx.lineWidth = DRAWING_STYLES.landmarkStrokeWidth;
  ctx.beginPath();
  
  for (let i = 0; i < landmarksLength; i++) {
    const landmark = landmarks[i];
    if (!landmark) continue;
    
    // Check visibility with model-specific threshold
    const isVisible = landmark.visibility === undefined || 
                      landmark.visibility >= visibilityThreshold;
    
    if (isVisible) {
      const x = landmark.x * canvasWidth;
      const y = landmark.y * canvasHeight;
      
      // Validate coordinates are valid numbers
      if (!isNaN(x) && !isNaN(y)) {
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, twoPI);
      }
    }
  }
  ctx.stroke();
  
  // Batch draw fills
  ctx.fillStyle = DRAWING_STYLES.landmarkColor;
  ctx.beginPath();
  for (let i = 0; i < landmarksLength; i++) {
    const landmark = landmarks[i];
    if (!landmark) continue;
    
    const isVisible = landmark.visibility === undefined || 
                      landmark.visibility >= visibilityThreshold;
    
    if (isVisible) {
      const x = landmark.x * canvasWidth;
      const y = landmark.y * canvasHeight;
      
      if (!isNaN(x) && !isNaN(y)) {
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, twoPI);
      }
    }
  }
  ctx.fill();

  // Restore context state
  ctx.restore();
};

