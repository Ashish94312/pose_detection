import { useState, useEffect, useRef, useCallback } from 'react';
import { SMOOTHING_CONFIG, PERFORMANCE_CONFIG, getModelConfig, DEFAULT_MODEL } from '../config/poseConfig';
import { createPoseModel, getModelMetadata } from '../models/poseModelFactory';
import { AngleSmoother, LandmarkSmoother } from '../utils/smoothing';
import { createBlazePoseHandler, createMoveNetHandler, drawPoseForModel } from './modelHandlers';

/**
 * Custom hook for multi-model pose detection (BlazePose & MoveNet)
 * @param {string} modelType - 'blazepose' or 'movenet' (default: DEFAULT_MODEL)
 * @returns {Object} Pose detection state and methods
 */
export const usePoseDetection = (modelType = DEFAULT_MODEL) => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [angles, setAngles] = useState(null);
  const [orientations, setOrientations] = useState(null);
  const [currentModelType, setCurrentModelType] = useState(modelType);
  
  const poseModelRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const isRunningRef = useRef(false);
  const angleSmootherRef = useRef(null);
  const orientationSmootherRef = useRef(null);
  const landmarkSmootherRef = useRef(null);
  const frameSkipCounterRef = useRef(0);
  const lastLandmarksRef = useRef(null);
  const lastAnglesRef = useRef(null);
  const lastOrientationsRef = useRef(null);
  const modelMetadataRef = useRef(null);
  const lastFpsRef = useRef(0);
  
  // Initialize smoothers
  useEffect(() => {
    if (SMOOTHING_CONFIG.enabled) {
      angleSmootherRef.current = new AngleSmoother(
        SMOOTHING_CONFIG.method,
        SMOOTHING_CONFIG.alpha,
        SMOOTHING_CONFIG.kalmanAngleProcessNoise || SMOOTHING_CONFIG.kalmanProcessNoise || 0.001,
        SMOOTHING_CONFIG.kalmanAngleMeasurementNoise || SMOOTHING_CONFIG.kalmanMeasurementNoise || 0.25
      );
      // Also smooth orientations to reduce fluctuations
      orientationSmootherRef.current = new AngleSmoother(
        SMOOTHING_CONFIG.method,
        SMOOTHING_CONFIG.alpha,
        SMOOTHING_CONFIG.kalmanAngleProcessNoise || SMOOTHING_CONFIG.kalmanProcessNoise || 0.001,
        SMOOTHING_CONFIG.kalmanAngleMeasurementNoise || SMOOTHING_CONFIG.kalmanMeasurementNoise || 0.25
      );
      landmarkSmootherRef.current = new LandmarkSmoother(
        SMOOTHING_CONFIG.landmarkSmoothing,
        SMOOTHING_CONFIG.landmarkSmoothingMethod === 'kalman', // Use specified method for landmarks
        SMOOTHING_CONFIG.kalmanProcessNoise || 0.001,
        SMOOTHING_CONFIG.kalmanMeasurementNoise || 0.25
      );
    }
  }, []);
  
  // Sync ref with state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Initialize pose detection model
  useEffect(() => {
    let isMounted = true;
    
    const initializeModel = async () => {
      try {
        setError(null);
        setIsModelLoaded(false);
        
        // Clean up previous model state completely
        if (poseModelRef.current) {
          poseModelRef.current.dispose();
          poseModelRef.current = null;
        }
        
        // Reset all model-specific state to ensure clean separation
        lastLandmarksRef.current = null;
        lastAnglesRef.current = null;
        lastOrientationsRef.current = null;
        frameSkipCounterRef.current = 0;
        lastVideoTimeRef.current = -1;
        
        // Reset smoothers for clean state
        if (angleSmootherRef.current) {
          angleSmootherRef.current.reset();
        }
        if (orientationSmootherRef.current) {
          orientationSmootherRef.current.reset();
        }
        if (landmarkSmootherRef.current) {
          landmarkSmootherRef.current.reset();
        }
        
        // Clear state
        setAngles(null);
        setOrientations(null);
        
        // Get model configuration
        const config = getModelConfig(currentModelType);
        const modelMetadata = getModelMetadata(currentModelType);
        modelMetadataRef.current = modelMetadata;
        
        // Create model instance
        const model = createPoseModel(currentModelType, config);
        
        // Load model
        await model.load();

        if (isMounted) {
          poseModelRef.current = model;
          setIsModelLoaded(true);
          setCurrentModelType(currentModelType);
        }
      } catch (err) {
        console.error(`Error initializing ${currentModelType} model:`, err);
        if (isMounted) {
          const errorMessage = currentModelType === 'movenet'
            ? `Failed to load MoveNet model: ${err.message || 'Unknown error'}. Make sure you have internet connection.`
            : `Failed to load BlazePose model: ${err.message || 'Unknown error'}. Make sure WebGPU is supported in your browser.`;
          setError(errorMessage);
          setIsModelLoaded(false);
        }
      }
    };

    initializeModel();
    
    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (poseModelRef.current) {
        poseModelRef.current.dispose();
        poseModelRef.current = null;
      }
      // Clean up state on unmount
      lastLandmarksRef.current = null;
      lastAnglesRef.current = null;
      lastOrientationsRef.current = null;
    };
  }, [currentModelType]);
  
  // Update model when modelType prop changes
  useEffect(() => {
    if (modelType !== currentModelType) {
      setCurrentModelType(modelType);
    }
  }, [modelType, currentModelType]);

  // Calculate FPS - optimized to reduce state updates
  const updateFPS = useCallback((currentTime) => {
    frameCountRef.current++;
    
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = currentTime;
      return;
    }
    
    const deltaTime = currentTime - lastTimeRef.current;
    if (deltaTime >= 1000) {
      // Calculate FPS: frames per second = (frameCount * 1000) / deltaTime
      // This formula correctly calculates FPS over the time period
      const currentFps = Math.round((frameCountRef.current * 1000) / deltaTime);
      
      // Only update state if FPS changed significantly (reduce unnecessary re-renders)
      // Update if difference is >= 2 FPS to avoid micro-updates
      if (Math.abs(currentFps - lastFpsRef.current) >= 2 || lastFpsRef.current === 0) {
        setFps(currentFps);
        lastFpsRef.current = currentFps;
      }
      
      // Reset for next measurement period
      frameCountRef.current = 0;
      lastTimeRef.current = currentTime;
    }
  }, []);

  // Run inference on video frame - uses model-specific handler
  const runInference = useCallback(async (video, canvas, ctx, currentFps) => {
    if (!poseModelRef.current || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    const videoTime = video.currentTime;
    if (videoTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = videoTime;
      
      const detectionInterval = PERFORMANCE_CONFIG.poseDetectionInterval;
      const shouldRunDetection = frameSkipCounterRef.current % detectionInterval === 0;
      
      frameSkipCounterRef.current++;
      
      // Use model-specific handler based on current model type
      const isBlazePose = currentModelType === 'blazepose';

      if (isBlazePose) {
        // BlazePose handler (synchronous detection)
        await createBlazePoseHandler(
          poseModelRef,
          lastLandmarksRef,
          lastAnglesRef,
          lastOrientationsRef,
          angleSmootherRef,
          orientationSmootherRef,
          landmarkSmootherRef,
          setAngles,
          setOrientations,
          modelMetadataRef,
          frameSkipCounterRef,
          shouldRunDetection
        )(video, canvas, ctx, currentFps);
      } else {
        // MoveNet handler (asynchronous detection)
        await createMoveNetHandler(
          poseModelRef,
          lastLandmarksRef,
          lastAnglesRef,
          lastOrientationsRef,
          angleSmootherRef,
          orientationSmootherRef,
          landmarkSmootherRef,
          setAngles,
          setOrientations,
          modelMetadataRef,
          frameSkipCounterRef,
          shouldRunDetection,
          isRunningRef
        )(video, canvas, ctx, currentFps);
      }
    }
  }, [currentModelType]);

  // Start inference loop
  const startInferenceLoop = useCallback((video, canvas) => {
    if (!poseModelRef.current || !video || !canvas) {
      console.error('Cannot start inference loop: missing dependencies');
      return;
    }

    // Stop any existing loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const ctx = canvas.getContext('2d');
    
    // Wait for video to have dimensions
    const setupCanvas = () => {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      if (videoWidth > 0 && videoHeight > 0) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        startLoop();
      } else {
        // Retry after a short delay
        setTimeout(setupCanvas, 100);
      }
    };

    const startLoop = () => {
      isRunningRef.current = true;
      lastVideoTimeRef.current = -1;
      lastTimeRef.current = 0;
      frameCountRef.current = 0;
      frameSkipCounterRef.current = 0;
      lastLandmarksRef.current = null;
      lastAnglesRef.current = null;
      lastOrientationsRef.current = null;

      const processFrame = async (currentTime) => {
        if (!isRunningRef.current) {
          return;
        }

        // Always draw video frame first - use willReadFrequently: false for better performance
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          } catch (err) {
            console.error('Error drawing video frame:', err);
          }
        }

        updateFPS(currentTime);
        
        // Run inference and wait for it to complete (especially important for MoveNet)
        // This ensures pose overlay matches the current video frame, eliminating lag
        try {
          await runInference(video, canvas, ctx, fps);
        } catch (err) {
          console.error('Error in inference:', err);
        }
        
        // Draw pose with detected landmarks (now synchronized with video frame)
        const landmarks = lastLandmarksRef.current;
        if (landmarks && landmarks.length > 0) {
          drawPoseForModel(landmarks, canvas, ctx, currentModelType);
        }
        
        animationFrameRef.current = requestAnimationFrame(processFrame);
      };

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    // Start setup
    if (video.readyState >= video.HAVE_METADATA) {
      setupCanvas();
    } else {
      video.addEventListener('loadedmetadata', setupCanvas, { once: true });
    }
  }, [updateFPS, runInference]);

  // Stop inference loop
  const stopInferenceLoop = useCallback(() => {
    isRunningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastVideoTimeRef.current = -1;
    lastTimeRef.current = 0;
    frameCountRef.current = 0;
    setFps(0);
    setAngles(null);
    setOrientations(null);
    
    // Reset smoothers
    if (angleSmootherRef.current) {
      angleSmootherRef.current.reset();
    }
    if (orientationSmootherRef.current) {
      orientationSmootherRef.current.reset();
    }
    if (landmarkSmootherRef.current) {
      landmarkSmootherRef.current.reset();
    }
    
  }, []);

  return {
    isModelLoaded,
    fps,
    isRunning,
    setIsRunning,
    error,
    angles,
    orientations,
    startInferenceLoop,
    stopInferenceLoop,
    modelType: currentModelType,
    modelMetadata: modelMetadataRef.current,
  };
};

