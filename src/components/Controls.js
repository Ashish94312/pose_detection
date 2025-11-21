import { memo } from 'react';
import './Controls.css';

/**
 * Controls component - Start/Stop camera buttons
 * @param {boolean} isModelLoaded - Whether the model is loaded
 * @param {boolean} isRunning - Whether inference is running
 * @param {Function} onStart - Start button handler
 * @param {Function} onStop - Stop button handler
 */
const Controls = memo(({ isModelLoaded, isRunning, onStart, onStop }) => {
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
    </div>
  );
});

Controls.displayName = 'Controls';

export default Controls;

