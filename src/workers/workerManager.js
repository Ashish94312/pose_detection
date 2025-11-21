/**
 * Worker Manager - Handles communication between main thread and BlazePose worker
 */

export class BlazePoseWorkerManager {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.pendingFrames = new Map();
    this.frameIdCounter = 0;
    this.config = null;
    this.onDetectionCallback = null;
    this.onErrorCallback = null;
    this.onStatusCallback = null;
  }

  /**
   * Initialize the worker with configuration
   */
  async initialize(config) {
    if (this.worker) {
      await this.dispose();
    }

    this.config = config;
    
    try {
      // Try to load worker from src/workers first (requires webpack config)
      // Fallback to public folder worker
      let workerUrl;
      
      // For Create React App, we need to use the public folder or configure webpack
      // Try public folder first (simpler, works out of the box)
      // Note: Using classic worker (not module) because MediaPipe's WASM uses importScripts
      try {
        workerUrl = '/blazePoseWorker.js';
        this.worker = new Worker(workerUrl); // Classic worker, not module worker
      } catch (e) {
        // If that fails, try to use the src worker (requires webpack config)
        console.warn('Could not load worker from public folder, trying src...');
        // This would require webpack worker-loader or similar
        throw new Error('Worker loading failed. Please ensure blazePoseWorker.js is in the public folder or configure webpack to handle workers.');
      }

      // Set up message handler
      this.worker.onmessage = (e) => {
        this.handleWorkerMessage(e.data);
      };

      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
      };

      // Initialize the worker
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 30000); // 30 second timeout

        const originalOnInit = this.onStatusCallback;
        this.onStatusCallback = (status) => {
          if (originalOnInit) originalOnInit(status);
        };

        const messageHandler = (e) => {
          const { type, success, error } = e.data;
          if (type === 'initialized') {
            clearTimeout(timeout);
            this.worker.removeEventListener('message', messageHandler);
            if (success) {
              this.isInitialized = true;
              resolve(true);
            } else {
              reject(new Error(error || 'Failed to initialize worker'));
            }
          }
        };

        this.worker.addEventListener('message', messageHandler);
        this.worker.postMessage({
          type: 'init',
          data: { config },
        });
      });
    } catch (error) {
      console.error('Error creating worker:', error);
      throw error;
    }
  }

  /**
   * Handle messages from worker
   */
  handleWorkerMessage(message) {
    const { type } = message;

    switch (type) {
      case 'status':
        if (this.onStatusCallback) {
          this.onStatusCallback(message);
        }
        break;

      case 'initialized':
        // Handled in initialize promise
        break;

      case 'detection':
        if (this.onDetectionCallback) {
          this.onDetectionCallback(message);
        }
        break;

      case 'error':
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error(message.error));
        }
        break;

      case 'disposed':
        this.isInitialized = false;
        break;

      default:
        console.warn('Unknown worker message type:', type);
    }
  }

  /**
   * Process a video frame
   */
  async detect(video, timestamp) {
    if (!this.worker || !this.isInitialized) {
      return null;
    }

    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return null;
    }

    try {
      // Use regular canvas if OffscreenCanvas is not available
      let canvas, ctx, imageData;
      
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
        ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        // Fallback to regular canvas (creates a temporary canvas element)
        canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      
      const frameId = this.frameIdCounter++;
      
      // Send frame to worker
      this.worker.postMessage({
        type: 'process',
        data: {
          imageData,
          timestamp: timestamp || performance.now(),
          frameId,
        },
      }, [imageData.data.buffer]); // Transfer ownership for better performance

      // Wait for result (with timeout)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.pendingFrames.delete(frameId);
          resolve(null);
        }, 1000); // 1 second timeout

        const handler = (e) => {
          const message = e.data;
          if (message.type === 'detection' && message.frameId === frameId) {
            clearTimeout(timeout);
            this.pendingFrames.delete(frameId);
            this.worker.removeEventListener('message', handler);
            resolve(message.landmarks);
          }
        };

        this.worker.addEventListener('message', handler);
        this.pendingFrames.set(frameId, { handler, timeout });
      });
    } catch (error) {
      console.error('Error processing frame in worker:', error);
      return null;
    }
  }

  /**
   * Set callback for detection results
   */
  setDetectionCallback(callback) {
    this.onDetectionCallback = callback;
  }

  /**
   * Set callback for errors
   */
  setErrorCallback(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Set callback for status updates
   */
  setStatusCallback(callback) {
    this.onStatusCallback = callback;
  }

  /**
   * Dispose of the worker
   */
  async dispose() {
    if (this.worker) {
      // Clear pending frames
      for (const [frameId, { timeout }] of this.pendingFrames.entries()) {
        clearTimeout(timeout);
      }
      this.pendingFrames.clear();

      // Send dispose message
      this.worker.postMessage({ type: 'dispose' });
      
      // Wait for confirmation or timeout
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.worker.terminate();
          this.worker = null;
          this.isInitialized = false;
          resolve();
        }, 1000);

        const handler = (e) => {
          if (e.data.type === 'disposed') {
            clearTimeout(timeout);
            this.worker.removeEventListener('message', handler);
            this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
            resolve();
          }
        };

        this.worker.addEventListener('message', handler);
      });
    }
  }
}

