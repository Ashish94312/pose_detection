import './AngleDisplay.css';

/**
 * AngleDisplay component - Shows joint angles and segment orientations
 * @param {Object} angles - Joint angles object
 * @param {Object} orientations - Segment orientations object
 */
const AngleDisplay = ({ angles, orientations }) => {
  if (!angles && !orientations) {
    return null;
  }

  const formatAngle = (angle) => {
    if (angle === null || angle === undefined || isNaN(angle)) return '—';
    return `${Math.round(angle)}°`;
  };

  const formatOrientation = (orientation) => {
    if (!orientation || orientation === null || orientation.angle === undefined || isNaN(orientation.angle)) return '—';
    return `${Math.round(orientation.angle)}°`;
  };

  return (
    <div className="angle-display">
      {angles && (
        <div className="angle-section">
          <h3>Joint Angles</h3>
          <div className="angle-grid">
            <div className="angle-group">
              <div className="angle-label">Left Shoulder</div>
              <div className="angle-value">{formatAngle(angles.leftShoulder)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Left Elbow</div>
              <div className="angle-value">{formatAngle(angles.leftElbow)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Shoulder</div>
              <div className="angle-value">{formatAngle(angles.rightShoulder)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Elbow</div>
              <div className="angle-value">{formatAngle(angles.rightElbow)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Left Hip</div>
              <div className="angle-value">{formatAngle(angles.leftHip)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Left Knee</div>
              <div className="angle-value">{formatAngle(angles.leftKnee)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Hip</div>
              <div className="angle-value">{formatAngle(angles.rightHip)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Knee</div>
              <div className="angle-value">{formatAngle(angles.rightKnee)}</div>
            </div>
          </div>
        </div>
      )}
      
      {orientations && (
        <div className="angle-section">
          <h3>Segment Orientations</h3>
          <div className="angle-grid">
            <div className="angle-group">
              <div className="angle-label">Left Upper Arm</div>
              <div className="angle-value">{formatOrientation(orientations.leftUpperArm)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Left Forearm</div>
              <div className="angle-value">{formatOrientation(orientations.leftForearm)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Upper Arm</div>
              <div className="angle-value">{formatOrientation(orientations.rightUpperArm)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Forearm</div>
              <div className="angle-value">{formatOrientation(orientations.rightForearm)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Left Thigh</div>
              <div className="angle-value">{formatOrientation(orientations.leftThigh)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Left Shin</div>
              <div className="angle-value">{formatOrientation(orientations.leftShin)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Thigh</div>
              <div className="angle-value">{formatOrientation(orientations.rightThigh)}</div>
            </div>
            <div className="angle-group">
              <div className="angle-label">Right Shin</div>
              <div className="angle-value">{formatOrientation(orientations.rightShin)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AngleDisplay;

