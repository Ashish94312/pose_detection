// MoveNet Lightning landmark indices (17 keypoints)
export const MOVENET_LANDMARK_INDICES = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_KNEE: 13,
  RIGHT_KNEE: 14,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
};

// BlazePose landmark indices (33 keypoints)
export const BLAZEPOSE_LANDMARK_INDICES = {
  // Face
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  
  // Upper body
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  
  // Lower body
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

// Default to BlazePose for backward compatibility
export const LANDMARK_INDICES = BLAZEPOSE_LANDMARK_INDICES;

/**
 * Calculate 3D distance between two points
 */
export const distance3D = (p1, p2) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = (p2.z || 0) - (p1.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Calculate 2D distance between two points
 */
export const distance2D = (p1, p2) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Check if landmark is visible and valid
 * @param {Object} landmark - Landmark object
 * @param {number} minVisibility - Minimum visibility threshold (default 0.3)
 * @returns {boolean} True if landmark is visible
 */
export const isLandmarkVisible = (landmark, minVisibility = 0.3) => {
  if (!landmark) return false;
  // Check if position is valid (not NaN, not undefined)
  if (landmark.x === undefined || landmark.y === undefined || 
      isNaN(landmark.x) || isNaN(landmark.y)) {
    return false;
  }
  // Check visibility threshold (lowered from 0.5 to 0.3 for better detection)
  const visibility = landmark.visibility !== undefined ? landmark.visibility : 1.0;
  return visibility >= minVisibility;
};

/**
 * Calculate angle between three points (goniometric angle)
 * Returns angle in degrees, or null if landmarks are not visible or too close
 * @param {Object} p1 - First point (start of first segment)
 * @param {Object} p2 - Second point (joint/vertex)
 * @param {Object} p3 - Third point (end of second segment)
 * @param {number} minDistance - Minimum distance between points (default 0.03)
 * @returns {number|null} Angle in degrees (0-180) or null if invalid
 */
export const calculateAngle = (p1, p2, p3, minDistance = 0.03) => {
  // Check visibility - early exit for better performance
  if (!isLandmarkVisible(p1) || !isLandmarkVisible(p2) || !isLandmarkVisible(p3)) {
    return null;
  }
  
  // Calculate vectors and distances in one pass for better performance
  const dx1 = p1.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dz1 = (p1.z || 0) - (p2.z || 0);
  
  const dx2 = p3.x - p2.x;
  const dy2 = p3.y - p2.y;
  const dz2 = (p3.z || 0) - (p2.z || 0);
  
  // Check minimum distances using squared distances (avoid sqrt for comparison)
  const dist12Sq = dx1 * dx1 + dy1 * dy1;
  const dist23Sq = dx2 * dx2 + dy2 * dy2;
  const minDistSq = minDistance * minDistance;
  
  if (dist12Sq < minDistSq || dist23Sq < minDistSq) {
    return null;
  }
  
  // Calculate dot product
  const dotProduct = dx1 * dx2 + dy1 * dy2 + dz1 * dz2;
  
  // Calculate magnitudes (only when needed)
  const mag1Sq = dist12Sq + dz1 * dz1;
  const mag2Sq = dist23Sq + dz2 * dz2;
  
  // Avoid division by zero
  if (mag1Sq === 0 || mag2Sq === 0) {
    return null;
  }
  
  // Calculate angle in radians, then convert to degrees
  const mag1 = Math.sqrt(mag1Sq);
  const mag2 = Math.sqrt(mag2Sq);
  const cosAngle = dotProduct / (mag1 * mag2);
  
  // Clamp to [-1, 1] to avoid NaN from acos
  const clampedCos = cosAngle > 1 ? 1 : (cosAngle < -1 ? -1 : cosAngle);
  const angleRad = Math.acos(clampedCos);
  const angleDeg = (angleRad * 180) / Math.PI;
  
  return angleDeg;
};

/**
 * Calculate segment orientation (direction vector)
 * @param {Object} p1 - Start point
 * @param {Object} p2 - End point
 * @param {number} minDistance - Minimum distance between points (default 0.03)
 * @returns {Object|null} Normalized direction vector {x, y, z, angle} or null if invalid
 */
export const calculateSegmentOrientation = (p1, p2, minDistance = 0.03) => {
  // Check visibility - early exit for better performance
  if (!isLandmarkVisible(p1) || !isLandmarkVisible(p2)) {
    return null;
  }
  
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = (p2.z || 0) - (p1.z || 0);
  
  // Use squared magnitude for comparison (avoid sqrt)
  const magnitudeSq = dx * dx + dy * dy + dz * dz;
  const minDistSq = minDistance * minDistance;
  
  // Check minimum distance
  if (magnitudeSq < minDistSq) {
    return null;
  }
  
  const magnitude = Math.sqrt(magnitudeSq);
  const invMagnitude = 1 / magnitude; // Pre-calculate inverse for division
  
  // Normalized direction vector
  const direction = {
    x: dx * invMagnitude,
    y: dy * invMagnitude,
    z: dz * invMagnitude,
    magnitude: magnitude
  };
  
  // Calculate biomechanically meaningful orientation angle
  // Using atan2(dx, dy) instead of atan2(dy, dx) gives orientation relative to vertical:
  //   0° = vertical down (pointing straight down)
  //   +90° = horizontal right
  //   -90° = horizontal left
  //   ±45° = diagonal
  // This is more intuitive for human limb orientation than camera coordinates
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  
  // Normalize to [-90, +90] range for better readability and biomechanical interpretation
  // This represents the tilt from vertical, which is more meaningful for human posture
  // Angles outside this range are flipped by 180° to represent the same physical orientation
  // from the opposite direction (e.g., 135° → -45°, -135° → 45°)
  if (angle > 90) {
    angle -= 180;
  } else if (angle < -90) {
    angle += 180;
  }
  
  direction.angle = angle;
  
  return direction;
};

/**
 * Calculate all joint angles from pose landmarks
 * Supports both MoveNet (17 keypoints) and BlazePose (33 keypoints)
 * @param {Array} landmarks - Array of pose landmarks
 * @returns {Object} Object containing all calculated angles
 */
export const calculateAllAngles = (landmarks) => {
  if (!landmarks || (landmarks.length < 17 && landmarks.length < 33)) {
    return null;
  }
  
  // Detect model type based on number of landmarks
  const isMoveNet = landmarks.length === 17;
  const INDICES = isMoveNet ? MOVENET_LANDMARK_INDICES : BLAZEPOSE_LANDMARK_INDICES;
  
  // Pre-allocate object for better performance
  const angles = {
    leftShoulder: null,
    leftElbow: null,
    rightShoulder: null,
    rightElbow: null,
    leftHip: null,
    leftKnee: null,
    rightHip: null,
    rightKnee: null,
    torso: null
  };
  
  // Cache landmark lookups for better performance
  const leftHip = landmarks[INDICES.LEFT_HIP];
  const leftShoulder = landmarks[INDICES.LEFT_SHOULDER];
  const leftElbow = landmarks[INDICES.LEFT_ELBOW];
  const leftWrist = landmarks[INDICES.LEFT_WRIST];
  const rightHip = landmarks[INDICES.RIGHT_HIP];
  const rightShoulder = landmarks[INDICES.RIGHT_SHOULDER];
  const rightElbow = landmarks[INDICES.RIGHT_ELBOW];
  const rightWrist = landmarks[INDICES.RIGHT_WRIST];
  const leftKnee = landmarks[INDICES.LEFT_KNEE];
  const leftAnkle = landmarks[INDICES.LEFT_ANKLE];
  const rightKnee = landmarks[INDICES.RIGHT_KNEE];
  const rightAnkle = landmarks[INDICES.RIGHT_ANKLE];
  
  // Left arm angles
  angles.leftShoulder = calculateAngle(leftHip, leftShoulder, leftElbow);
  angles.leftElbow = calculateAngle(leftShoulder, leftElbow, leftWrist);
  
  // Right arm angles
  angles.rightShoulder = calculateAngle(rightHip, rightShoulder, rightElbow);
  angles.rightElbow = calculateAngle(rightShoulder, rightElbow, rightWrist);
  
  // Left leg angles
  angles.leftHip = calculateAngle(leftShoulder, leftHip, leftKnee);
  angles.leftKnee = calculateAngle(leftHip, leftKnee, leftAnkle);
  
  // Right leg angles
  angles.rightHip = calculateAngle(rightShoulder, rightHip, rightKnee);
  angles.rightKnee = calculateAngle(rightHip, rightKnee, rightAnkle);
  
  // Torso angle (shoulder to hip)
  angles.torso = calculateAngle(leftShoulder, leftHip, rightHip);
  
  return angles;
};

/**
 * Calculate all segment orientations
 * Supports both MoveNet (17 keypoints) and BlazePose (33 keypoints)
 * @param {Array} landmarks - Array of pose landmarks
 * @returns {Object} Object containing segment orientations
 */
export const calculateAllOrientations = (landmarks) => {
  if (!landmarks || (landmarks.length < 17 && landmarks.length < 33)) {
    return null;
  }
  
  // Detect model type based on number of landmarks
  const isMoveNet = landmarks.length === 17;
  const INDICES = isMoveNet ? MOVENET_LANDMARK_INDICES : BLAZEPOSE_LANDMARK_INDICES;
  
  // Pre-allocate object for better performance
  const orientations = {
    leftUpperArm: null,
    rightUpperArm: null,
    leftForearm: null,
    rightForearm: null,
    leftThigh: null,
    rightThigh: null,
    leftShin: null,
    rightShin: null,
    torso: null
  };
  
  // Cache landmark lookups for better performance
  const leftShoulder = landmarks[INDICES.LEFT_SHOULDER];
  const leftElbow = landmarks[INDICES.LEFT_ELBOW];
  const leftWrist = landmarks[INDICES.LEFT_WRIST];
  const rightShoulder = landmarks[INDICES.RIGHT_SHOULDER];
  const rightElbow = landmarks[INDICES.RIGHT_ELBOW];
  const rightWrist = landmarks[INDICES.RIGHT_WRIST];
  const leftHip = landmarks[INDICES.LEFT_HIP];
  const leftKnee = landmarks[INDICES.LEFT_KNEE];
  const leftAnkle = landmarks[INDICES.LEFT_ANKLE];
  const rightHip = landmarks[INDICES.RIGHT_HIP];
  const rightKnee = landmarks[INDICES.RIGHT_KNEE];
  const rightAnkle = landmarks[INDICES.RIGHT_ANKLE];
  
  // Upper arm segments
  orientations.leftUpperArm = calculateSegmentOrientation(leftShoulder, leftElbow);
  orientations.rightUpperArm = calculateSegmentOrientation(rightShoulder, rightElbow);
  
  // Forearm segments
  orientations.leftForearm = calculateSegmentOrientation(leftElbow, leftWrist);
  orientations.rightForearm = calculateSegmentOrientation(rightElbow, rightWrist);
  
  // Thigh segments
  orientations.leftThigh = calculateSegmentOrientation(leftHip, leftKnee);
  orientations.rightThigh = calculateSegmentOrientation(rightHip, rightKnee);
  
  // Lower leg segments
  orientations.leftShin = calculateSegmentOrientation(leftKnee, leftAnkle);
  orientations.rightShin = calculateSegmentOrientation(rightKnee, rightAnkle);
  
  // Torso segment
  orientations.torso = calculateSegmentOrientation(leftShoulder, leftHip);
  
  return orientations;
};

