import { useState, memo, useMemo } from 'react';
import { getModelMetadata } from '../models/poseModelFactory';
import './ModelSelector.css';

/**
 * ModelSelector component - Allows users to switch between pose detection models
 * @param {string} currentModel - Currently selected model type
 * @param {Function} onModelChange - Callback when model changes
 * @param {boolean} isModelLoaded - Whether the current model is loaded
 * @param {boolean} isRunning - Whether inference is running
 */
const ModelSelector = memo(({ currentModel, onModelChange, isModelLoaded, isRunning }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const models = useMemo(() => ['blazepose', 'movenet'], []);
  const currentMetadata = useMemo(() => getModelMetadata(currentModel), [currentModel]);

  const handleModelSelect = (modelType) => {
    if (modelType !== currentModel && !isRunning) {
      onModelChange(modelType);
      setIsExpanded(false);
    }
  };

  return (
    <div className="model-selector">
      <div 
        className="model-selector-header"
        onClick={() => !isRunning && setIsExpanded(!isExpanded)}
        style={{ cursor: isRunning ? 'not-allowed' : 'pointer' }}
      >
        <div className="model-selector-info">
          <span className="model-selector-label">Model:</span>
          <span className="model-selector-name">{currentMetadata.name}</span>
          {isModelLoaded && <span className="model-status-badge loaded">Loaded</span>}
          {!isModelLoaded && <span className="model-status-badge loading">Loading...</span>}
        </div>
        {!isRunning && (
          <span className="model-selector-arrow">{isExpanded ? '▲' : '▼'}</span>
        )}
      </div>
      
      {isExpanded && !isRunning && (
        <div className="model-selector-dropdown">
          {models.map((modelType) => {
            const metadata = getModelMetadata(modelType);
            const isSelected = modelType === currentModel;
            
            return (
              <div
                key={modelType}
                className={`model-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleModelSelect(modelType)}
              >
                <div className="model-option-header">
                  <span className="model-option-name">{metadata.name}</span>
                  {isSelected && <span className="model-option-check">✓</span>}
                </div>
                <div className="model-option-details">
                  <span className="model-option-provider">{metadata.provider}</span>
                  <span className="model-option-keypoints">{metadata.keypoints} keypoints</span>
                  {metadata.has3D && <span className="model-option-feature">3D</span>}
                </div>
                <div className="model-option-description">{metadata.description}</div>
              </div>
            );
          })}
        </div>
      )}
      
      {isRunning && (
        <div className="model-selector-warning">
          Stop detection to switch models
        </div>
      )}
    </div>
  );
});

ModelSelector.displayName = 'ModelSelector';

export default ModelSelector;

