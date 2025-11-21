/**
 * Pose Model Factory - Abstraction layer for different pose detection models
 * Supports: BlazePose (MediaPipe) and MoveNet Lightning (TensorFlow.js)
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as tf from '@tensorflow/tfjs';
import { BlazePoseWorkerManager } from '../workers/workerManager';

/**
 * Base class for pose detection models
 */
class BasePoseModel {
  constructor(config) {
    this.config = config;
    this.model = null;
    this.isLoaded = false;
  }

  async load() {
    throw new Error('load() must be implemented by subclass');
  }

  async detect(video, timestamp) {
    throw new Error('detect() must be implemented by subclass');
  }

  dispose() {
    // Override in subclasses if needed
  }
}

/**
 * BlazePose model implementation (MediaPipe) - Main thread version
 */
class BlazePoseModel extends BasePoseModel {
  async load() {
    try {
      const vision = await FilesetResolver.forVisionTasks(this.config.wasmPath);
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: this.config.modelAssetPath,
          delegate: this.config.delegate,
        },
        runningMode: this.config.runningMode,
        numPoses: this.config.numPoses,
        minPoseDetectionConfidence: this.config.minPoseDetectionConfidence,
        minPosePresenceConfidence: this.config.minPosePresenceConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });

      this.model = poseLandmarker;
      this.isLoaded = true;
      return true;
    } catch (error) {
      console.error('Error loading BlazePose model:', error);
      throw error;
    }
  }

  async detect(video, timestamp) {
    if (!this.model || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return null;
    }

    try {
      const result = this.model.detectForVideo(video, timestamp || performance.now());
      
      if (result.landmarks && result.landmarks.length > 0) {
        // BlazePose returns landmarks in normalized coordinates (0-1)
        // Convert to our standard format
        return result.landmarks[0].map(landmark => ({
          x: landmark.x,
          y: landmark.y,
          z: landmark.z || 0,
          visibility: landmark.visibility || 1.0,
        }));
      }
      return null;
    } catch (error) {
      console.error('Error running BlazePose detection:', error);
      return null;
    }
  }
}

/**
 * BlazePose model implementation using Web Worker
 */
class BlazePoseWorkerModel extends BasePoseModel {
  constructor(config) {
    super(config);
    this.workerManager = new BlazePoseWorkerManager();
  }

  async load() {
    try {
      await this.workerManager.initialize(this.config);
      this.isLoaded = true;
      return true;
    } catch (error) {
      console.error('Error loading BlazePose worker model:', error);
      throw error;
    }
  }

  async detect(video, timestamp) {
    if (!this.isLoaded || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return null;
    }

    try {
      return await this.workerManager.detect(video, timestamp || performance.now());
    } catch (error) {
      console.error('Error running BlazePose worker detection:', error);
      return null;
    }
  }

  dispose() {
    if (this.workerManager) {
      this.workerManager.dispose();
    }
  }
}

/**
 * MoveNet Lightning model implementation (TensorFlow.js)
 */
class MoveNetModel extends BasePoseModel {
  async load() {
    try {
      console.log('Loading MoveNet model from TensorFlow Hub...');
      const loadStartTime = performance.now();
      
      // Enable model caching for faster subsequent loads
      const model = await tf.loadGraphModel(this.config.modelUrl, { 
        fromTFHub: true,
        // Enable caching to speed up subsequent loads
        requestInit: {
          cache: 'force-cache', // Use browser cache if available
        },
      });
      
      const loadTime = performance.now() - loadStartTime;
      console.log(`MoveNet model loaded in ${loadTime.toFixed(0)}ms`);
      
      this.model = model;
      this.isLoaded = true;
      return true;
    } catch (error) {
      console.error('Error loading MoveNet model:', error);
      throw error;
    }
  }

  async detect(video, timestamp) {
    if (!this.model || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return null;
    }

    try {
      // MoveNet expects 192x192 image, int32 format
      // Use tf.tidy to automatically clean up intermediate tensors
      const keypoints = await tf.tidy(() => {
        const imageTensor = tf.browser.fromPixels(video);
        const resized = tf.image.resizeBilinear(imageTensor, [192, 192]);
        const casted = resized.cast('int32');
        const expanded = casted.expandDims(0); // Add batch dimension -> [1, 192, 192, 3]
        
        // Run inference
        // MoveNet outputs shape [1, 1, 17, 3] where last dim is [y, x, confidence]
        const predictions = this.model.predict(expanded);
        const keypointsTensor = predictions.squeeze(); // Remove batch and pose dimensions -> [17, 3]
        
        // Synchronously get array data (faster than async array())
        // This keeps computation in tidy scope
        return keypointsTensor.arraySync();
      });
      
      // MoveNet outputs: [y, x, confidence] for each of 17 keypoints
      // Check if pose score is above threshold
      const poseScore = keypoints[0][2]; // Use nose confidence as pose score
      if (poseScore >= this.config.minPoseScore) {
        // Pre-allocate array for better performance
        const landmarks = new Array(17);
        for (let i = 0; i < 17; i++) {
          const [y, x, confidence] = keypoints[i];
          landmarks[i] = {
            x: x, // Normalized 0-1
            y: y, // Normalized 0-1
            z: 0, // MoveNet doesn't provide depth
            visibility: confidence, // Use confidence as visibility
          };
        }
        return landmarks;
      }
      return null;
    } catch (error) {
      console.error('Error running MoveNet detection:', error);
      return null;
    }
  }

  dispose() {
    if (this.model) {
      // TensorFlow.js models don't need explicit disposal, but we can clean up
      this.model = null;
    }
  }
}

/**
 * Factory function to create pose detection models
 * @param {string} modelType - 'blazepose' or 'movenet'
 * @param {Object} config - Model-specific configuration
 * @param {boolean} useWorker - Whether to use Web Worker for BlazePose (default: true)
 * @returns {BasePoseModel} Instance of the requested model
 */
export const createPoseModel = (modelType, config, useWorker = true) => {
  switch (modelType.toLowerCase()) {
    case 'blazepose':
      // Use worker by default for BlazePose to avoid blocking main thread
      return useWorker ? new BlazePoseWorkerModel(config) : new BlazePoseModel(config);
    case 'movenet':
    case 'movenet-lightning':
      return new MoveNetModel(config);
    default:
      throw new Error(`Unsupported model type: ${modelType}`);
  }
};

/**
 * Get model metadata
 * @param {string} modelType - Model type
 * @returns {Object} Model metadata
 */
export const getModelMetadata = (modelType) => {
  const metadata = {
    blazepose: {
      name: 'BlazePose GHUM',
      provider: 'MediaPipe',
      keypoints: 33,
      has3D: true,
      hasWorldLandmarks: true,
      description: 'High accuracy 3D pose estimation with 33 keypoints',
    },
    movenet: {
      name: 'MoveNet Lightning',
      provider: 'TensorFlow.js',
      keypoints: 17,
      has3D: false,
      hasWorldLandmarks: false,
      description: 'Fast 2D pose estimation with 17 keypoints',
    },
  };

  return metadata[modelType.toLowerCase()] || metadata.blazepose;
};

