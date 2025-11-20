import { useState, useEffect, useRef, useCallback } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { POSE_CONFIG, SMOOTHING_CONFIG, PERFORMANCE_CONFIG } from '../config/poseConfig';
import { drawPose } from '../utils/poseDrawing';
import { calculateAllAngles, calculateAllOrientations } from '../utils/poseAngles';
import { AngleSmoother, LandmarkSmoother } from '../utils/smoothing';
import { createPoseData } from '../utils/poseSchema';
import { posePubSub } from '../utils/pubsub';

/**
 * Custom hook for MediaPipe BlazePose GHUM pose detection
 * @returns {Object} Pose detection state and methods
 */
export const usePoseDetection = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [angles, setAngles] = useState(null);
  const [orientations, setOrientations] = useState(null);
  
  const poseLandmarkerRef = useRef(null);
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
        SMOOTHING_CONFIG.method === 'kalman', // Use Kalman for landmarks if method is kalman
        SMOOTHING_CONFIG.kalmanProcessNoise || 0.001,
        SMOOTHING_CONFIG.kalmanMeasurementNoise || 0.25
      );
    }
  }, []);
  
  // Sync ref with state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Initialize MediaPipe Pose Landmarker
  useEffect(() => {
    let isMounted = true;
    
    const initializePoseLandmarker = async () => {
      try {
        setError(null);
        
        const vision = await FilesetResolver.forVisionTasks(POSE_CONFIG.wasmPath);
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_CONFIG.modelAssetPath,
            delegate: POSE_CONFIG.delegate,
          },
          runningMode: POSE_CONFIG.runningMode,
          numPoses: POSE_CONFIG.numPoses,
          minPoseDetectionConfidence: POSE_CONFIG.minPoseDetectionConfidence,
          minPosePresenceConfidence: POSE_CONFIG.minPosePresenceConfidence,
          minTrackingConfidence: POSE_CONFIG.minTrackingConfidence,
        });

        if (isMounted) {
          poseLandmarkerRef.current = poseLandmarker;
          setIsModelLoaded(true);
        }
      } catch (err) {
        console.error('Error initializing pose landmarker:', err);
        if (isMounted) {
          setError(`Failed to load model: ${err.message || 'Unknown error'}. Make sure WebGPU is supported in your browser.`);
          setIsModelLoaded(false);
        }
      }
    };

    initializePoseLandmarker();
    
    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Calculate FPS
  const updateFPS = useCallback((currentTime) => {
    frameCountRef.current++;
    
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = currentTime;
    }
    
    const deltaTime = currentTime - lastTimeRef.current;
    if (deltaTime >= 1000) {
      const currentFps = Math.round((frameCountRef.current * 1000) / deltaTime);
      setFps(currentFps);
      
      frameCountRef.current = 0;
      lastTimeRef.current = currentTime;
    }
  }, []);

  // Run inference on video frame
  const runInference = useCallback((video, canvas, ctx, currentFps) => {
    if (!poseLandmarkerRef.current || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    const videoTime = video.currentTime;
    if (videoTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = videoTime;
      
      const detectionInterval = PERFORMANCE_CONFIG.poseDetectionInterval;
      const shouldRunDetection = frameSkipCounterRef.current % detectionInterval === 0;
      
      frameSkipCounterRef.current++;
      
      let rawLandmarks = null;
      
      if (shouldRunDetection) {
        // Run pose detection
        const result = poseLandmarkerRef.current.detectForVideo(video, performance.now());

        if (result.landmarks && result.landmarks.length > 0) {
          rawLandmarks = result.landmarks[0];
          // Cache raw landmarks before smoothing
          lastLandmarksRef.current = rawLandmarks;
        } else {
          lastLandmarksRef.current = null;
        }
      } else {
        // Use cached raw landmarks on skipped frames
        rawLandmarks = lastLandmarksRef.current;
      }
      
      // Always apply smoothing to landmarks (whether new or cached) for consistent smooth rendering
      let landmarks = rawLandmarks;
      if (landmarks && SMOOTHING_CONFIG.enabled && landmarkSmootherRef.current) {
        landmarks = landmarkSmootherRef.current.smooth(landmarks);
      }
      
      // Always draw if we have landmarks (either new or cached)
      if (landmarks) {
        let smoothedAngles = lastAnglesRef.current;
        let smoothedOrientations = lastOrientationsRef.current;
        
        // Only calculate angles/orientations on detection frames (expensive operations)
        if (shouldRunDetection) {
          // Calculate angles and orientations
          const rawAngles = calculateAllAngles(landmarks);
          const calculatedOrientations = calculateAllOrientations(landmarks);
          
          // Apply angle smoothing if enabled
          smoothedAngles = rawAngles;
          if (SMOOTHING_CONFIG.enabled && angleSmootherRef.current && rawAngles) {
            smoothedAngles = angleSmootherRef.current.smoothAngles(rawAngles);
          }
          
          // Apply orientation smoothing to reduce fluctuations
          smoothedOrientations = calculatedOrientations;
          if (SMOOTHING_CONFIG.enabled && orientationSmootherRef.current && calculatedOrientations) {
            smoothedOrientations = orientationSmootherRef.current.smoothOrientations(calculatedOrientations);
          }
          
          // Cache smoothed values for non-detection frames
          lastAnglesRef.current = smoothedAngles;
          lastOrientationsRef.current = smoothedOrientations;
        }
        
        // Update state (use cached smoothed values if available)
        if (smoothedAngles) {
          setAngles(smoothedAngles);
        }
        if (smoothedOrientations) {
          setOrientations(smoothedOrientations);
        }
        
        // Create structured pose data and publish (only on detection frames)
        if (shouldRunDetection && smoothedAngles && smoothedOrientations) {
          const poseData = createPoseData(
            landmarks,
            smoothedAngles,
            smoothedOrientations,
            performance.now(),
            currentFps || 0
          );
          
          // Only publish and log if we have valid data
          if (poseData) {
            // Publish pose data via pub/sub
            posePubSub.publish(poseData);
          }
        }
        
        // Draw pose landmarks on top of video (every frame for smooth rendering)
        drawPose(landmarks, canvas, ctx);
      } else {
        setAngles(null);
        setOrientations(null);
        lastAnglesRef.current = null;
        lastOrientationsRef.current = null;
      }
    }
  }, []);

  // Start inference loop
  const startInferenceLoop = useCallback((video, canvas) => {
    if (!poseLandmarkerRef.current || !video || !canvas) {
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

      const processFrame = (currentTime) => {
        if (!isRunningRef.current) {
          return;
        }

        // Always draw video frame
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          } catch (err) {
            console.error('Error drawing video frame:', err);
          }
        }

        updateFPS(currentTime);
        // Use the official FPS state (updated every 1 second) for pose data
        runInference(video, canvas, ctx, fps);
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
  };
};

