import { useState, memo, useMemo } from 'react';
import { RESOLUTION_PRESETS } from '../config/poseConfig';
import './ResolutionSelector.css';

/**
 * ResolutionSelector component - Allows users to switch video resolution
 * @param {Object} currentResolution - Currently selected resolution {width, height, label}
 * @param {Function} onResolutionChange - Callback when resolution changes
 * @param {boolean} isRunning - Whether video stream is running
 */
const ResolutionSelector = memo(({ currentResolution, onResolutionChange, isRunning }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const resolutions = useMemo(() => RESOLUTION_PRESETS, []);

  const handleResolutionSelect = (resolution) => {
    if (resolution.label !== currentResolution.label && !isRunning) {
      onResolutionChange(resolution);
      setIsExpanded(false);
    }
  };

  return (
    <div className="resolution-selector">
      <div 
        className="resolution-selector-header"
        onClick={() => !isRunning && setIsExpanded(!isExpanded)}
        style={{ cursor: isRunning ? 'not-allowed' : 'pointer' }}
      >
        <div className="resolution-selector-info">
          <span className="resolution-selector-label">Resolution:</span>
          <span className="resolution-selector-name">{currentResolution.label}</span>
        </div>
        {!isRunning && (
          <span className="resolution-selector-arrow">{isExpanded ? '▲' : '▼'}</span>
        )}
      </div>
      
      {isExpanded && !isRunning && (
        <div className="resolution-selector-dropdown">
          {resolutions.map((resolution) => {
            const isSelected = resolution.label === currentResolution.label;
            
            return (
              <div
                key={resolution.label}
                className={`resolution-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleResolutionSelect(resolution)}
              >
                <div className="resolution-option-header">
                  <span className="resolution-option-name">{resolution.label}</span>
                  {isSelected && <span className="resolution-option-check">✓</span>}
                </div>
                <div className="resolution-option-details">
                  <span className="resolution-option-size">{resolution.width} × {resolution.height}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {isRunning && (
        <div className="resolution-selector-warning">
          Stop video to change resolution
        </div>
      )}
    </div>
  );
});

ResolutionSelector.displayName = 'ResolutionSelector';

export default ResolutionSelector;

