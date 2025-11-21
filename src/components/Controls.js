import { memo, useState, useEffect } from 'react';
import logger from '../utils/logger';
import './Controls.css';

/**
 * Controls component - Start/Stop camera buttons and log download
 * @param {boolean} isModelLoaded - Whether the model is loaded
 * @param {boolean} isRunning - Whether inference is running
 * @param {Function} onStart - Start button handler
 * @param {Function} onStop - Stop button handler
 */
const Controls = memo(({ isModelLoaded, isRunning, onStart, onStop }) => {
  const [logCount, setLogCount] = useState(0);

  // Update log count periodically
  useEffect(() => {
    const updateLogCount = () => {
      setLogCount(logger.getLogCount());
    };

    updateLogCount();
    const interval = setInterval(updateLogCount, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  const handleDownloadLogs = () => {
    const count = logger.getLogCount();
    if (count === 0) {
      alert('No logs to download.');
      return;
    }
    
    // Download as both text and JSON
    logger.downloadLogsAsText();
    // Small delay to allow first download to complete
    setTimeout(() => {
      logger.downloadLogsAsJSON();
    }, 100);
  };

  return (
    <div className="controls">
      <button
        onClick={onStart}
        disabled={!isModelLoaded || isRunning}
        className="control-button"
      >
        Start Camera
      </button>
      <button
        onClick={onStop}
        disabled={!isRunning}
        className="control-button stop-button"
      >
        Stop Camera
      </button>
      <button
        onClick={handleDownloadLogs}
        className="control-button log-button"
        title={`Download ${logCount} log entries`}
      >
        Download Logs ({logCount})
      </button>
    </div>
  );
});

Controls.displayName = 'Controls';

export default Controls;

