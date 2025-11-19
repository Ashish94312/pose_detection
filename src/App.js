import { useEffect, useCallback, useRef, useState } from 'react';
import { usePoseDetection } from './hooks/usePoseDetection';
import { useVideoStream } from './hooks/useVideoStream';
import StatusDisplay from './components/StatusDisplay';
import VideoCanvas from './components/VideoCanvas';
import Controls from './components/Controls';
import AngleDisplay from './components/AngleDisplay';
import Info from './components/Info';
// Jump Detection Module (can be removed by deleting jumpDetection folder)
import { JumpWidgets } from './jumpDetection';
import './App.css';

function App() {
  const [appError, setAppError] = useState(null);

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
  } = usePoseDetection();

  const {
    videoRef,
    isStreaming,
    startStream,
    stopStream,
  } = useVideoStream();

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
          <>
            <StatusDisplay isModelLoaded={isModelLoaded} fps={fps} />

            <VideoCanvas ref={canvasRef} videoRef={videoRef} />

            <Controls
              isModelLoaded={isModelLoaded}
              isRunning={isRunning}
              onStart={handleStart}
              onStop={handleStop}
            />

            <AngleDisplay angles={angles} orientations={orientations} />

            <JumpWidgets />

            <Info />
          </>
        )}
      </header>
    </div>
  );
}

export default App;
