/**
 * Web Worker for BlazePose pose detection
 * 
 * IMPORTANT: This worker file requires MediaPipe to be bundled with webpack.
 * MediaPipe Tasks Vision is an ES module and cannot be loaded via importScripts.
 * 
 * To use this worker:
 * 1. Install worker-loader: npm install --save-dev worker-loader
 * 2. Configure webpack to bundle MediaPipe in the worker
 * 3. Or use react-app-rewired to configure webpack
 * 
 * For now, this worker is a placeholder. The actual implementation should
 * be in src/workers/blazePoseWorker.js and bundled by webpack.
 */

// This worker cannot work without proper webpack bundling
// MediaPipe Tasks Vision requires ES modules, which don't work with importScripts
self.postMessage({
  type: 'error',
  error: 'Worker not properly configured. MediaPipe must be bundled with webpack. Please use the main thread version or configure webpack worker-loader.'
});

let poseLandmarker = null;
let isInitialized = false;

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
