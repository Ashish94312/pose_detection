/**
 * Schema for pose data structure
 * Contains joints, angles, orientations, and metadata
 */

/**
 * Check if we have minimum valid data to publish
 * @param {Array} landmarks - Pose landmarks
 * @param {Object} angles - Joint angles (optional)
 * @returns {boolean} True if we have enough valid data
 */
const hasValidPoseData = (landmarks, angles) => {
  if (!landmarks || (landmarks.length < 17 && landmarks.length < 33)) return false;
  
  // Check if we have at least some key visible landmarks
  // Different indices for MoveNet (17) vs BlazePose (33)
  const isMoveNet = landmarks.length === 17;
  const keyIndices = isMoveNet ? [5, 6, 11, 12] : [11, 12, 23, 24]; // shoulders and hips
  const hasKeyLandmarks = keyIndices.some(idx => {
    const landmark = landmarks[idx];
    return landmark && 
           landmark.visibility !== undefined && 
           landmark.visibility >= 0.5;
  });
  
  // If we have key landmarks, that's enough (jump detector only needs joints)
  // Angles are optional - they're nice to have but not required
  if (hasKeyLandmarks) return true;
  
  // Fallback: check if we have valid angles (for backward compatibility)
  const hasValidAngles = angles && Object.values(angles).some(angle => angle !== null);
  
  return hasValidAngles;
};

/**
 * Create standardized pose data structure
 * Only creates data if we have valid, visible landmarks
 * @param {Array} landmarks - Pose landmarks array
 * @param {Object} angles - Joint angles object
 * @param {Object} orientations - Segment orientations object
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} fps - Current FPS
 * @param {Object} modelMetadata - Model metadata (optional)
 * @returns {Object|null} Structured pose data or null if invalid
 */
export const createPoseData = (landmarks, angles, orientations, timestamp, fps, modelMetadata = null) => {
  // Validate that we have minimum valid data
  if (!hasValidPoseData(landmarks, angles)) {
    return null;
  }
  
  // Determine model info from metadata or landmarks
  const isMoveNet = landmarks.length === 17;
  const defaultMetadata = {
    model: isMoveNet ? 'MoveNet Lightning' : 'BlazePose GHUM',
    provider: isMoveNet ? 'TensorFlow.js' : 'MediaPipe',
    keypoints: landmarks.length,
    has3D: !isMoveNet,
    version: '1.0',
  };
  
  const metadata = modelMetadata || defaultMetadata;
  
  return {
    timestamp: timestamp || Date.now(),
    fps: fps || 0,
    metadata: {
      ...metadata,
      frameRate: fps,
    },
    joints: extractJoints(landmarks),
    angles: formatAngles(angles),
    orientations: formatOrientations(orientations),
    actions: detectActions(angles, orientations),
  };
};

/**
 * Extract joint positions from landmarks
 * Supports both MoveNet (17 keypoints) and BlazePose (33 keypoints)
 * @param {Array} landmarks - Pose landmarks
 * @returns {Object} Joint positions
 */
const extractJoints = (landmarks) => {
  if (!landmarks || (landmarks.length < 17 && landmarks.length < 33)) {
    return null;
  }

  const isMoveNet = landmarks.length === 17;
  
  if (isMoveNet) {
    // MoveNet has 17 keypoints with different indices
    return {
      // Face
      nose: formatLandmark(landmarks[0]),
      leftEye: formatLandmark(landmarks[1]),
      rightEye: formatLandmark(landmarks[2]),
      leftEar: formatLandmark(landmarks[3]),
      rightEar: formatLandmark(landmarks[4]),
      
      // Upper body
      leftShoulder: formatLandmark(landmarks[5]),
      rightShoulder: formatLandmark(landmarks[6]),
      leftElbow: formatLandmark(landmarks[7]),
      rightElbow: formatLandmark(landmarks[8]),
      leftWrist: formatLandmark(landmarks[9]),
      rightWrist: formatLandmark(landmarks[10]),
      
      // Lower body
      leftHip: formatLandmark(landmarks[11]),
      rightHip: formatLandmark(landmarks[12]),
      leftKnee: formatLandmark(landmarks[13]),
      rightKnee: formatLandmark(landmarks[14]),
      leftAnkle: formatLandmark(landmarks[15]),
      rightAnkle: formatLandmark(landmarks[16]),
    };
  } else {
    // BlazePose has 33 keypoints
  return {
    // Face
    nose: formatLandmark(landmarks[0]),
    leftEye: formatLandmark(landmarks[2]),
    rightEye: formatLandmark(landmarks[5]),
    leftEar: formatLandmark(landmarks[7]),
    rightEar: formatLandmark(landmarks[8]),
    
    // Upper body
    leftShoulder: formatLandmark(landmarks[11]),
    rightShoulder: formatLandmark(landmarks[12]),
    leftElbow: formatLandmark(landmarks[13]),
    rightElbow: formatLandmark(landmarks[14]),
    leftWrist: formatLandmark(landmarks[15]),
    rightWrist: formatLandmark(landmarks[16]),
    
    // Lower body
    leftHip: formatLandmark(landmarks[23]),
    rightHip: formatLandmark(landmarks[24]),
    leftKnee: formatLandmark(landmarks[25]),
    rightKnee: formatLandmark(landmarks[26]),
    leftAnkle: formatLandmark(landmarks[27]),
    rightAnkle: formatLandmark(landmarks[28]),
  };
  }
};

/**
 * Format landmark to include position and visibility
 * @param {Object} landmark - Landmark object
 * @returns {Object|null} Formatted landmark or null if invalid
 */
const formatLandmark = (landmark) => {
  if (!landmark) return null;
  
  const visibility = landmark.visibility !== undefined ? landmark.visibility : 1.0;
  
  return {
    x: landmark.x || 0,
    y: landmark.y || 0,
    z: landmark.z || 0,
    visibility: visibility,
    visible: visibility >= 0.5,
  };
};

/**
 * Format angles object
 * @param {Object} angles - Angles object
 * @returns {Object} Formatted angles
 */
const formatAngles = (angles) => {
  if (!angles) return null;

  return {
    leftArm: {
      shoulder: angles.leftShoulder,
      elbow: angles.leftElbow,
    },
    rightArm: {
      shoulder: angles.rightShoulder,
      elbow: angles.rightElbow,
    },
    leftLeg: {
      hip: angles.leftHip,
      knee: angles.leftKnee,
    },
    rightLeg: {
      hip: angles.rightHip,
      knee: angles.rightKnee,
    },
    torso: angles.torso,
  };
};

/**
 * Format orientations object
 * @param {Object} orientations - Orientations object
 * @returns {Object} Formatted orientations
 */
const formatOrientations = (orientations) => {
  if (!orientations) return null;

  return {
    leftArm: {
      upperArm: orientations.leftUpperArm ? {
        angle: orientations.leftUpperArm.angle,
        magnitude: orientations.leftUpperArm.magnitude,
      } : null,
      forearm: orientations.leftForearm ? {
        angle: orientations.leftForearm.angle,
        magnitude: orientations.leftForearm.magnitude,
      } : null,
    },
    rightArm: {
      upperArm: orientations.rightUpperArm ? {
        angle: orientations.rightUpperArm.angle,
        magnitude: orientations.rightUpperArm.magnitude,
      } : null,
      forearm: orientations.rightForearm ? {
        angle: orientations.rightForearm.angle,
        magnitude: orientations.rightForearm.magnitude,
      } : null,
    },
    leftLeg: {
      thigh: orientations.leftThigh ? {
        angle: orientations.leftThigh.angle,
        magnitude: orientations.leftThigh.magnitude,
      } : null,
      shin: orientations.leftShin ? {
        angle: orientations.leftShin.angle,
        magnitude: orientations.leftShin.magnitude,
      } : null,
    },
    rightLeg: {
      thigh: orientations.rightThigh ? {
        angle: orientations.rightThigh.angle,
        magnitude: orientations.rightThigh.magnitude,
      } : null,
      shin: orientations.rightShin ? {
        angle: orientations.rightShin.angle,
        magnitude: orientations.rightShin.magnitude,
      } : null,
    },
    torso: orientations.torso ? {
      angle: orientations.torso.angle,
      magnitude: orientations.torso.magnitude,
    } : null,
  };
};

/**
 * Detect basic actions from pose data
 * Only uses valid (non-null) angles for detection
 * @param {Object} angles - Joint angles
 * @param {Object} orientations - Segment orientations
 * @returns {Object} Detected actions
 */
const detectActions = (angles, orientations) => {
  if (!angles) {
    return {
      standing: false,
      sitting: false,
      armsRaised: false,
      jumping: false,
    };
  }

  // Only use valid (non-null) angles for detection
  const leftKneeAngle = angles.leftKnee;
  const rightKneeAngle = angles.rightKnee;
  const leftElbowAngle = angles.leftElbow;
  const rightElbowAngle = angles.rightElbow;
  const leftShoulderAngle = angles.leftShoulder;
  const rightShoulderAngle = angles.rightShoulder;

  // Sitting detection: knees bent significantly (only if both knees are visible)
  const sitting = (
    leftKneeAngle !== null && rightKneeAngle !== null &&
    (leftKneeAngle < 120 || rightKneeAngle < 120)
  );

  // Standing detection: knees relatively straight (only if both knees are visible)
  const standing = (
    leftKneeAngle !== null && rightKneeAngle !== null &&
    leftKneeAngle > 150 && rightKneeAngle > 150
  );

  // Arms raised detection: only if relevant angles are visible
  const leftArmRaised = (
    leftElbowAngle !== null && leftShoulderAngle !== null &&
    leftElbowAngle > 90 && leftShoulderAngle < 90
  );
  const rightArmRaised = (
    rightElbowAngle !== null && rightShoulderAngle !== null &&
    rightElbowAngle > 90 && rightShoulderAngle < 90
  );
  const armsRaised = leftArmRaised || rightArmRaised;

  const jumping = false;

  return {
    standing,
    sitting,
    armsRaised,
    jumping,
  };
};

