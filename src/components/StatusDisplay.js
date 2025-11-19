import './StatusDisplay.css';

/**
 * StatusDisplay component - Shows model status and FPS
 * @param {boolean} isModelLoaded - Whether the model is loaded
 * @param {number} fps - Current FPS value
 */
const StatusDisplay = ({ isModelLoaded, fps }) => {
  return (
    <div className="status-container">
      <div className="status-item">
        <span className="status-label">Status:</span>
        <span className={isModelLoaded ? 'status-success' : 'status-loading'}>
          {isModelLoaded ? 'Ready' : 'Loading...'}
        </span>
      </div>
      <div className="status-item">
        <span className="status-label">FPS:</span>
        <span className="fps-value">{fps}</span>
      </div>
    </div>
  );
};

export default StatusDisplay;

