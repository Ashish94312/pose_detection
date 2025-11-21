import { useEffect, useCallback, useRef, useState } from 'react';
import { usePoseDetection } from './hooks/usePoseDetection';
import { useVideoStream } from './hooks/useVideoStream';
import StatusDisplay from './components/StatusDisplay';
import VideoCanvas from './components/VideoCanvas';
import Controls from './components/Controls';
import AngleDisplay from './components/AngleDisplay';
import ModelSelector from './components/ModelSelector';
import ResolutionSelector from './components/ResolutionSelector';
import Info from './components/Info';
import { JumpWidgets } from './jumpDetection';
import { DEFAULT_MODEL, DEFAULT_RESOLUTION } from './config/poseConfig';
import logger from './utils/logger';
import PerformanceProfiler from './components/PerformanceProfiler';
import './App.css';

function App() {
  const [appError, setAppError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [selectedResolution, setSelectedResolution] = useState(DEFAULT_RESOLUTION);

  const {
    isModelLoaded,
    fps,
    isRunning,
    setIsRunning,
    error,
    angles,
    orientations,
    startInferenceLoop,
    stopInferenceLoop,
    modelType,
    modelMetadata,
  } = usePoseDetection(selectedModel);

  const {
    videoRef,
    isStreaming,
    actualResolution,
    startStream,
    stopStream,
  } = useVideoStream(selectedResolution);

  const canvasRef = useRef(null);

  // Error boundary effect
  useEffect(() => {
    const handleError = (event) => {
      console.error('Global error:', event.error);
      setAppError(event.error?.message || 'An unexpected error occurred');
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Start camera and inference
  const handleStart = useCallback(async () => {
    try {
      await startStream();
      setIsRunning(true);
      
      // Wait for video to be ready, then start inference
      if (videoRef.current) {
        const startInference = () => {
          if (canvasRef.current && videoRef.current) {
            startInferenceLoop(videoRef.current, canvasRef.current);
          }
        };

        if (videoRef.current.readyState >= 2) {
          // Video already loaded
          startInference();
        } else {
          // Wait for video metadata
          videoRef.current.addEventListener('loadedmetadata', startInference, { once: true });
        }
      }
    } catch (err) {
      alert(err.message);
    }
  }, [startStream, setIsRunning, videoRef, startInferenceLoop]);

  // Stop camera and inference
  const handleStop = useCallback(() => {
    stopInferenceLoop();
    stopStream();
    setIsRunning(false);
  }, [stopInferenceLoop, stopStream, setIsRunning]);

  // Handle model change
  const handleModelChange = useCallback((newModelType) => {
    if (!isRunning) {
      setSelectedModel(newModelType);
    }
  }, [isRunning]);

  // Handle resolution change
  const handleResolutionChange = useCallback((newResolution) => {
    if (!isRunning) {
      setSelectedResolution(newResolution);
    }
  }, [isRunning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStreaming) {
        handleStop();
      }
    };
  }, [isStreaming, handleStop]);

  // Show error if any
  const displayError = appError || error;

  return (
    <div className="App">
      <header className="App-header">
        <h1>Pose Detection</h1>
        
        {displayError && (
          <div className="error-message">
            <strong>Error:</strong> {displayError}
            <br />
            <small>Check the browser console for more details.</small>
          </div>
        )}

        {!displayError && (
          <div className="main-content">
            <div className="camera-section">
              <VideoCanvas ref={canvasRef} videoRef={videoRef} />
            </div>
            <div className="data-section">
              <div className="data-card">
                <ModelSelector
                  currentModel={modelType || selectedModel}
                  onModelChange={handleModelChange}
                  isModelLoaded={isModelLoaded}
                  isRunning={isRunning}
                />
                <ResolutionSelector
                  currentResolution={selectedResolution}
                  onResolutionChange={handleResolutionChange}
                  isRunning={isRunning}
                />
                <StatusDisplay 
                  isModelLoaded={isModelLoaded} 
                  fps={fps} 
                  actualResolution={actualResolution}
                />
                <Controls
                  isModelLoaded={isModelLoaded}
                  isRunning={isRunning}
                  onStart={handleStart}
                  onStop={handleStop}
                />
              </div>

              <div className="data-card">
                <AngleDisplay angles={angles} orientations={orientations} />
              </div>

              <div className="data-card">           
                <JumpWidgets /> 
              </div>

              <div className="data-card">
                <PerformanceProfiler />
              </div>

              <Info />
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
