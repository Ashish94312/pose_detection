/**
 * Web Worker for BlazePose pose detection
 * Runs pose detection in a separate thread to avoid blocking the main thread
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let poseLandmarker = null;
let isInitialized = false;
let frameCounter = 0;
let lastTimestamp = 0;

/**
 * Initialize the BlazePose model in the worker
 */
async function initializeModel(config) {
  try {
    self.postMessage({ type: 'status', status: 'initializing', message: 'Loading MediaPipe...' });
    
    const vision = await FilesetResolver.forVisionTasks(config.wasmPath);
    
    self.postMessage({ type: 'status', status: 'initializing', message: 'Creating PoseLandmarker...' });
    
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: config.modelAssetPath,
        delegate: config.delegate,
      },
      runningMode: config.runningMode,
      numPoses: config.numPoses,
      minPoseDetectionConfidence: config.minPoseDetectionConfidence,
      minPosePresenceConfidence: config.minPosePresenceConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
    });

    isInitialized = true;
    self.postMessage({ 
      type: 'initialized', 
      success: true,
      message: 'BlazePose model loaded successfully'
    });
  } catch (error) {
    console.error('Worker: Error initializing BlazePose model:', error);
    self.postMessage({ 
      type: 'initialized', 
      success: false,
      error: error.message || 'Failed to initialize BlazePose model'
    });
  }
}

/**
 * Process a video frame for pose detection
 */
async function processFrame(imageData, timestamp, frameId) {
  if (!isInitialized || !poseLandmarker) {
    return;
  }

  try {
    // Create an ImageBitmap from ImageData for MediaPipe
    // MediaPipe can work with ImageBitmap in workers
    const imageBitmap = await createImageBitmap(imageData);
    
    // Run pose detection
    const result = poseLandmarker.detectForVideo(imageBitmap, timestamp || performance.now());
    
    // Clean up ImageBitmap
    imageBitmap.close();
    
    // Convert landmarks to our standard format
    let landmarks = null;
    if (result.landmarks && result.landmarks.length > 0) {
      landmarks = result.landmarks[0].map(landmark => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z || 0,
        visibility: landmark.visibility || 1.0,
      }));
    }

    // Send results back to main thread
    self.postMessage({
      type: 'detection',
      frameId,
      timestamp,
      landmarks,
      success: true,
    });
  } catch (error) {
    console.error('Worker: Error processing frame:', error);
    self.postMessage({
      type: 'detection',
      frameId,
      timestamp,
      landmarks: null,
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handle messages from main thread
 */
self.onmessage = async function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      await initializeModel(data.config);
      break;

    case 'process':
      await processFrame(data.imageData, data.timestamp, data.frameId);
      break;

    case 'dispose':
      if (poseLandmarker) {
        // MediaPipe models don't have explicit dispose, but we can clean up
        poseLandmarker = null;
        isInitialized = false;
      }
      self.postMessage({ type: 'disposed' });
      break;

    default:
      console.warn('Worker: Unknown message type:', type);
  }
};

// Handle errors
self.onerror = function(error) {
  console.error('Worker error:', error);
  self.postMessage({
    type: 'error',
    error: error.message || 'Unknown worker error',
  });
};

