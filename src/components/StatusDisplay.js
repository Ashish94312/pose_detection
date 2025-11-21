import { memo } from 'react';
import './StatusDisplay.css';

/**
 * StatusDisplay component - Shows model status, FPS, and video resolution
 * @param {boolean} isModelLoaded - Whether the model is loaded
 * @param {boolean} isLoading - Whether the model is currently loading
 * @param {string} loadingProgress - Loading progress message
 * @param {number} fps - Current FPS value
 * @param {Object} actualResolution - Actual video resolution {width, height}
 */
const StatusDisplay = memo(({ isModelLoaded, isLoading, loadingProgress, fps, actualResolution }) => {
  return (
    <div className="status-container">
      <div className="status-item">
        <span className="status-label">Status:</span>
        <span className={isModelLoaded ? 'status-success' : 'status-loading'}>
          {isModelLoaded ? 'Ready' : (isLoading ? (loadingProgress || 'Loading...') : 'Not Loaded')}
        </span>
      </div>
      <div className="status-item">
        <span className="status-label">FPS:</span>
        <span className="fps-value">{fps}</span>
      </div>
      {actualResolution && (
        <div className="status-item">
          <span className="status-label">Video:</span>
          <span className="resolution-value">
            {actualResolution.width} × {actualResolution.height}
          </span>
        </div>
      )}
    </div>
  );
});

StatusDisplay.displayName = 'StatusDisplay';

export default StatusDisplay;

