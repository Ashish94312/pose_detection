# BlazePose Web Worker

This directory contains the Web Worker implementation for BlazePose pose detection, which runs pose detection in a separate thread to avoid blocking the main thread.

## Files

- `blazePoseWorker.js` - Worker file in `src/workers/` (for development with webpack configuration)
- `workerManager.js` - Manager class that handles communication between main thread and worker
- `public/blazePoseWorker.js` - Worker file in public folder (works with Create React App out of the box)

## How It Works

1. **Worker Manager** (`workerManager.js`): 
   - Manages the Web Worker lifecycle
   - Handles communication between main thread and worker
   - Transfers video frames to the worker
   - Receives pose detection results

2. **Worker** (`blazePoseWorker.js`):
   - Loads MediaPipe BlazePose model
   - Processes video frames in a separate thread
   - Sends detection results back to main thread

## Setup

### Current Status

**The worker is currently disabled by default** because MediaPipe Tasks Vision is an ES module and cannot be easily loaded in a classic worker via `importScripts()`. The worker requires webpack configuration to properly bundle MediaPipe.

### To Enable the Worker

You need to configure webpack to bundle MediaPipe in the worker:

1. **Install worker-loader:**
   ```bash
   npm install --save-dev worker-loader
   ```

2. **Configure webpack** (using react-app-rewired or eject):
   ```javascript
   {
     test: /\.worker\.js$/,
     use: { loader: 'worker-loader' }
   }
   ```

3. **Update the worker** to import MediaPipe as an ES module:
   ```javascript
   import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
   ```

4. **Update workerManager.js** to use the bundled worker:
   ```javascript
   import Worker from './blazePoseWorker.worker.js';
   this.worker = new Worker();
   ```

5. **Enable the worker** in `poseConfig.js`:
   ```javascript
   useWorker: true
   ```

### For Webpack Configuration (Alternative)

If you want to use the worker from `src/workers/` and bundle MediaPipe:

1. Install worker-loader:
   ```bash
   npm install --save-dev worker-loader
   ```

2. Configure webpack (or use react-app-rewired):
   ```javascript
   {
     test: /\.worker\.js$/,
     use: { loader: 'worker-loader' }
   }
   ```

3. Update `workerManager.js` to import the worker:
   ```javascript
   import Worker from './blazePoseWorker.worker.js';
   this.worker = new Worker();
   ```

## Configuration

You can enable/disable the worker in `src/config/poseConfig.js`:

```javascript
export const BLAZEPOSE_CONFIG = {
  // ... other config
  useWorker: true, // Set to false to run on main thread
};
```

## Benefits

- **Non-blocking**: Pose detection runs in a separate thread
- **Better performance**: Main thread stays responsive for UI updates
- **Smoother experience**: No frame drops or UI freezing during detection

## Limitations

- Requires browser support for Web Workers and OffscreenCanvas (or fallback to regular canvas)
- Worker file must be accessible (in public folder or properly bundled)
- MediaPipe must be loadable in the worker context

## Troubleshooting

### Worker fails to load
- Ensure `blazePoseWorker.js` is in the `public/` folder
- Check browser console for errors
- Verify MediaPipe CDN is accessible (if using public worker)

### Detection not working
- Check that `useWorker: true` is set in config
- Verify worker initialization messages in console
- Ensure video frames are being sent to worker

### Performance issues
- Consider using the main thread version (`useWorker: false`) for comparison
- Check worker message queue isn't backing up
- Monitor frame processing times

