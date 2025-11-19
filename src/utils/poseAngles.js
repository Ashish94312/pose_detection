// BlazePose landmark indices
export const LANDMARK_INDICES = {
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
  // Check visibility
  if (!isLandmarkVisible(p1) || !isLandmarkVisible(p2) || !isLandmarkVisible(p3)) {
    return null;
  }
  
  // Check minimum distances to avoid unstable calculations
  const dist12 = distance2D(p1, p2);
  const dist23 = distance2D(p2, p3);
  
  if (dist12 < minDistance || dist23 < minDistance) {
    return null;
  }
  
  // Vector from p2 to p1
  const v1 = {
    x: p1.x - p2.x,
    y: p1.y - p2.y,
    z: (p1.z || 0) - (p2.z || 0)
  };
  
  // Vector from p2 to p3
  const v2 = {
    x: p3.x - p2.x,
    y: p3.y - p2.y,
    z: (p3.z || 0) - (p2.z || 0)
  };
  
  // Calculate dot product
  const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  
  // Calculate magnitudes
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
  
  // Avoid division by zero
  if (mag1 === 0 || mag2 === 0) {
    return null;
  }
  
  // Calculate angle in radians, then convert to degrees
  const cosAngle = dotProduct / (mag1 * mag2);
  // Clamp to [-1, 1] to avoid NaN from acos
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
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
  // Check visibility
  if (!isLandmarkVisible(p1) || !isLandmarkVisible(p2)) {
    return null;
  }
  
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = (p2.z || 0) - (p1.z || 0);
  
  const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // Check minimum distance
  if (magnitude < minDistance) {
    return null;
  }
  
  // Normalized direction vector
  const direction = {
    x: dx / magnitude,
    y: dy / magnitude,
    z: dz / magnitude,
    magnitude: magnitude
  };
  
  // Calculate angle in XY plane (for 2D visualization)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  direction.angle = angle;
  
  return direction;
};

/**
 * Calculate all joint angles from pose landmarks
 * @param {Array} landmarks - Array of pose landmarks
 * @returns {Object} Object containing all calculated angles
 */
export const calculateAllAngles = (landmarks) => {
  if (!landmarks || landmarks.length < 33) {
    return null;
  }
  
  const angles = {};
  
  // Left arm angles
  angles.leftShoulder = calculateAngle(
    landmarks[LANDMARK_INDICES.LEFT_HIP],
    landmarks[LANDMARK_INDICES.LEFT_SHOULDER],
    landmarks[LANDMARK_INDICES.LEFT_ELBOW]
  );
  
  angles.leftElbow = calculateAngle(
    landmarks[LANDMARK_INDICES.LEFT_SHOULDER],
    landmarks[LANDMARK_INDICES.LEFT_ELBOW],
    landmarks[LANDMARK_INDICES.LEFT_WRIST]
  );
  
  // Right arm angles
  angles.rightShoulder = calculateAngle(
    landmarks[LANDMARK_INDICES.RIGHT_HIP],
    landmarks[LANDMARK_INDICES.RIGHT_SHOULDER],
    landmarks[LANDMARK_INDICES.RIGHT_ELBOW]
  );
  
  angles.rightElbow = calculateAngle(
    landmarks[LANDMARK_INDICES.RIGHT_SHOULDER],
    landmarks[LANDMARK_INDICES.RIGHT_ELBOW],
    landmarks[LANDMARK_INDICES.RIGHT_WRIST]
  );
  
  // Left leg angles
  angles.leftHip = calculateAngle(
    landmarks[LANDMARK_INDICES.LEFT_SHOULDER],
    landmarks[LANDMARK_INDICES.LEFT_HIP],
    landmarks[LANDMARK_INDICES.LEFT_KNEE]
  );
  
  angles.leftKnee = calculateAngle(
    landmarks[LANDMARK_INDICES.LEFT_HIP],
    landmarks[LANDMARK_INDICES.LEFT_KNEE],
    landmarks[LANDMARK_INDICES.LEFT_ANKLE]
  );
  
  // Right leg angles
  angles.rightHip = calculateAngle(
    landmarks[LANDMARK_INDICES.RIGHT_SHOULDER],
    landmarks[LANDMARK_INDICES.RIGHT_HIP],
    landmarks[LANDMARK_INDICES.RIGHT_KNEE]
  );
  
  angles.rightKnee = calculateAngle(
    landmarks[LANDMARK_INDICES.RIGHT_HIP],
    landmarks[LANDMARK_INDICES.RIGHT_KNEE],
    landmarks[LANDMARK_INDICES.RIGHT_ANKLE]
  );
  
  // Torso angle (shoulder to hip)
  angles.torso = calculateAngle(
    landmarks[LANDMARK_INDICES.LEFT_SHOULDER],
    landmarks[LANDMARK_INDICES.LEFT_HIP],
    landmarks[LANDMARK_INDICES.RIGHT_HIP]
  );
  
  return angles;
};

/**
 * Calculate all segment orientations
 * @param {Array} landmarks - Array of pose landmarks
 * @returns {Object} Object containing segment orientations
 */
export const calculateAllOrientations = (landmarks) => {
  if (!landmarks || landmarks.length < 33) {
    return null;
  }
  
  const orientations = {};
  
  // Upper arm segments
  orientations.leftUpperArm = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.LEFT_SHOULDER],
    landmarks[LANDMARK_INDICES.LEFT_ELBOW]
  );
  
  orientations.rightUpperArm = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.RIGHT_SHOULDER],
    landmarks[LANDMARK_INDICES.RIGHT_ELBOW]
  );
  
  // Forearm segments
  orientations.leftForearm = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.LEFT_ELBOW],
    landmarks[LANDMARK_INDICES.LEFT_WRIST]
  );
  
  orientations.rightForearm = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.RIGHT_ELBOW],
    landmarks[LANDMARK_INDICES.RIGHT_WRIST]
  );
  
  // Thigh segments
  orientations.leftThigh = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.LEFT_HIP],
    landmarks[LANDMARK_INDICES.LEFT_KNEE]
  );
  
  orientations.rightThigh = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.RIGHT_HIP],
    landmarks[LANDMARK_INDICES.RIGHT_KNEE]
  );
  
  // Lower leg segments
  orientations.leftShin = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.LEFT_KNEE],
    landmarks[LANDMARK_INDICES.LEFT_ANKLE]
  );
  
  orientations.rightShin = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.RIGHT_KNEE],
    landmarks[LANDMARK_INDICES.RIGHT_ANKLE]
  );
  
  // Torso segment
  orientations.torso = calculateSegmentOrientation(
    landmarks[LANDMARK_INDICES.LEFT_SHOULDER],
    landmarks[LANDMARK_INDICES.LEFT_HIP]
  );
  
  return orientations;
};

