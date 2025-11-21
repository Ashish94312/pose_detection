/**
 * Model-specific handlers - Separated logic for each pose detection model
 * Ensures models don't interfere with each other
 */

import { SMOOTHING_CONFIG } from '../config/poseConfig';
import { drawPose } from '../utils/poseDrawing';
import { calculateAllAngles, calculateAllOrientations } from '../utils/poseAngles';
import { createPoseData } from '../utils/poseSchema';
import { posePubSub } from '../utils/pubsub';

/**
 * BlazePose-specific inference handler
 * Handles synchronous detection (MediaPipe)
 */
export const createBlazePoseHandler = (
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
) => {
  return async (video, canvas, ctx, currentFps) => {
    if (!poseModelRef.current || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    let rawLandmarks = null;

    if (shouldRunDetection) {
      try {
        // BlazePose detection is synchronous (MediaPipe)
        rawLandmarks = await poseModelRef.current.detect(video, performance.now());
        
        if (rawLandmarks && rawLandmarks.length > 0) {
          lastLandmarksRef.current = rawLandmarks;
        } else {
          lastLandmarksRef.current = null;
        }
      } catch (err) {
        console.error('Error running BlazePose detection:', err);
        lastLandmarksRef.current = null;
        rawLandmarks = null;
      }
    } else {
      // Use cached landmarks on skipped frames
      rawLandmarks = lastLandmarksRef.current;
    }

    return processLandmarks(
      rawLandmarks,
      lastAnglesRef,
      lastOrientationsRef,
      angleSmootherRef,
      orientationSmootherRef,
      landmarkSmootherRef,
      setAngles,
      setOrientations,
      modelMetadataRef,
      shouldRunDetection,
      currentFps,
      canvas,
      ctx
    );
  };
};

/**
 * MoveNet-specific inference handler
 * Handles asynchronous detection (TensorFlow.js)
 */
export const createMoveNetHandler = (
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
) => {
  return async (video, canvas, ctx, currentFps) => {
    if (!poseModelRef.current || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    let rawLandmarks = lastLandmarksRef.current;

    if (shouldRunDetection) {
      // Wait for detection to complete to ensure pose overlay matches current video frame
      // This eliminates lag between video and pose overlay
      try {
        const detectedLandmarks = await poseModelRef.current.detect(video, performance.now());
        
        if (!isRunningRef.current) return; // Don't update if stopped
        
        if (detectedLandmarks && detectedLandmarks.length > 0) {
          lastLandmarksRef.current = detectedLandmarks;
          rawLandmarks = detectedLandmarks; // Use newly detected landmarks
        } else {
          lastLandmarksRef.current = null;
          rawLandmarks = null;
        }
      } catch (err) {
        console.error('Error running MoveNet detection:', err);
        if (isRunningRef.current) {
          lastLandmarksRef.current = null;
          rawLandmarks = null;
        }
      }
    }

    // Process and draw with current landmarks (either newly detected or cached)
    return processLandmarks(
      rawLandmarks,
      lastAnglesRef,
      lastOrientationsRef,
      angleSmootherRef,
      orientationSmootherRef,
      landmarkSmootherRef,
      setAngles,
      setOrientations,
      modelMetadataRef,
      shouldRunDetection,
      currentFps,
      canvas,
      ctx
    );
  };
};

/**
 * Common landmark processing logic (shared between models)
 */
const processLandmarks = (
  rawLandmarks,
  lastAnglesRef,
  lastOrientationsRef,
  angleSmootherRef,
  orientationSmootherRef,
  landmarkSmootherRef,
  setAngles,
  setOrientations,
  modelMetadataRef,
  shouldRunDetection,
  currentFps,
  canvas,
  ctx
) => {
  if (!rawLandmarks || rawLandmarks.length === 0) {
    return null;
  }

  // Prepare landmarks for drawing and calculations
  let landmarksForDrawing = rawLandmarks;
  let landmarksForCalculations = rawLandmarks;

  // Optionally smooth landmarks for drawing
  if (landmarksForDrawing && SMOOTHING_CONFIG.enabled && 
      SMOOTHING_CONFIG.smoothLandmarksForDrawing && landmarkSmootherRef.current) {
    landmarksForDrawing = landmarkSmootherRef.current.smooth(landmarksForDrawing);
  }

  // Always smooth landmarks for angle/orientation calculations
  if (landmarksForCalculations && SMOOTHING_CONFIG.enabled && landmarkSmootherRef.current) {
    landmarksForCalculations = landmarkSmootherRef.current.smooth(landmarksForCalculations);
  }

  let smoothedAngles = lastAnglesRef.current;
  let smoothedOrientations = lastOrientationsRef.current;

  // Only calculate angles/orientations on detection frames
  if (shouldRunDetection) {
    const rawAngles = calculateAllAngles(landmarksForCalculations);
    const calculatedOrientations = calculateAllOrientations(landmarksForCalculations);

    // Apply angle smoothing
    smoothedAngles = rawAngles;
    if (SMOOTHING_CONFIG.enabled && angleSmootherRef.current && rawAngles) {
      smoothedAngles = angleSmootherRef.current.smoothAngles(rawAngles);
    }

    // Apply orientation smoothing
    smoothedOrientations = calculatedOrientations;
    if (SMOOTHING_CONFIG.enabled && orientationSmootherRef.current && calculatedOrientations) {
      smoothedOrientations = orientationSmootherRef.current.smoothOrientations(calculatedOrientations);
    }

    // Cache smoothed values
    lastAnglesRef.current = smoothedAngles;
    lastOrientationsRef.current = smoothedOrientations;
  }

  // Batch state updates - use requestAnimationFrame to batch updates and reduce re-renders
  // This prevents blocking the main thread during pose detection
  if (smoothedAngles || smoothedOrientations) {
    requestAnimationFrame(() => {
      if (smoothedAngles) {
        setAngles(smoothedAngles);
      }
      if (smoothedOrientations) {
        setOrientations(smoothedOrientations);
      }
    });
  }

  // Create and publish pose data (only on detection frames)
  if (shouldRunDetection && smoothedAngles && smoothedOrientations) {
    const poseData = createPoseData(
      landmarksForCalculations,
      smoothedAngles,
      smoothedOrientations,
      performance.now(),
      currentFps || 0,
      modelMetadataRef.current
    );

    if (poseData) {
      posePubSub.publish(poseData);
    }
  }

  // Return landmarks for drawing (drawing happens separately in processFrame)
  return landmarksForDrawing;
};

/**
 * Model-specific drawing handler
 * Handles drawing with model-specific optimizations
 */
export const drawPoseForModel = (landmarks, canvas, ctx, modelType) => {
  if (!landmarks || landmarks.length === 0) {
    return;
  }

  // Apply smoothing if enabled
  let landmarksForDrawing = landmarks;
  // Note: Smoothing is handled in processLandmarks, but we can add model-specific smoothing here if needed

  // Draw pose (drawPose automatically detects model type by landmark count)
  drawPose(landmarksForDrawing, canvas, ctx);
};

