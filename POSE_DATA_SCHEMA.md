# Pose Data Schema

This document describes the JSON schema for pose data published via the pub/sub mechanism.

## Schema Structure

```json
{
  "timestamp": 1234567890.123,
  "fps": 30,
  "metadata": {
    "model": "BlazePose GHUM",
    "version": "1.0",
    "frameRate": 30
  },
  "joints": {
    "nose": { "x": 0.5, "y": 0.3, "z": -0.1, "visibility": 0.95, "visible": true },
    "leftShoulder": { "x": 0.4, "y": 0.5, "z": 0.0, "visibility": 0.98, "visible": true },
    "rightShoulder": { "x": 0.6, "y": 0.5, "z": 0.0, "visibility": 0.97, "visible": true },
    ...
  },
  "angles": {
    "leftArm": {
      "shoulder": 45.2,
      "elbow": 120.5
    },
    "rightArm": {
      "shoulder": 50.1,
      "elbow": 135.8
    },
    "leftLeg": {
      "hip": 170.2,
      "knee": 145.3
    },
    "rightLeg": {
      "hip": 165.8,
      "knee": 150.1
    },
    "torso": 175.5
  },
  "orientations": {
    "leftArm": {
      "upperArm": { "angle": 56.2, "magnitude": 0.15 },
      "forearm": { "angle": 79.3, "magnitude": 0.12 }
    },
    ...
  },
  "actions": {
    "standing": true,
    "sitting": false,
    "armsRaised": false,
    "jumping": false
  }
}
```

## Field Descriptions

### Top Level

- **timestamp**: High-resolution timestamp in milliseconds (from `performance.now()`)
- **fps**: Current frames per second
- **metadata**: Model information
- **joints**: 3D positions of all body joints
- **angles**: Joint angles in degrees (goniometric)
- **orientations**: Segment orientations (direction vectors)
- **actions**: Detected actions (boolean flags)

### Joints

Each joint contains:
- **x, y, z**: Normalized coordinates (0-1 for x, y; depth for z)
- **visibility**: Confidence score (0-1)
- **visible**: Boolean indicating if visibility >= 0.5

Available joints:
- Face: `nose`, `leftEye`, `rightEye`, `leftEar`, `rightEar`
- Upper body: `leftShoulder`, `rightShoulder`, `leftElbow`, `rightElbow`, `leftWrist`, `rightWrist`
- Lower body: `leftHip`, `rightHip`, `leftKnee`, `rightKnee`, `leftAnkle`, `rightAnkle`

### Angles

Joint angles are in degrees (0-180):
- **leftArm**: `shoulder`, `elbow`
- **rightArm**: `shoulder`, `elbow`
- **leftLeg**: `hip`, `knee`
- **rightLeg**: `hip`, `knee`
- **torso**: Torso angle

Note: Angles may be `null` if landmarks are not visible or too close.

### Orientations

Segment orientations contain:
- **angle**: Direction angle in degrees (-180 to 180)
- **magnitude**: Segment length (normalized)

Available segments:
- Arms: `upperArm`, `forearm` (left/right)
- Legs: `thigh`, `shin` (left/right)
- **torso**: Torso segment

### Actions

Basic action detection:
- **standing**: Knees relatively straight (>150°)
- **sitting**: Knees bent significantly (<120°)
- **armsRaised**: Arms raised above shoulders
- **jumping**: Placeholder for future jump detection

## Usage

### Subscribe to Pose Data

```javascript
import { posePubSub } from './utils/pubsub';

const unsubscribe = posePubSub.subscribe((poseData) => {
  // Process pose data
  console.log('Received pose data:', poseData);
  
  // Example: Jump detection logic
  if (poseData.actions.jumping) {
    // Handle jump
  }
  
  // Example: Calculate vertical velocity
  // const velocity = calculateVelocity(poseData);
});

// Unsubscribe when done
// unsubscribe();
```

### Sample Data Export

The first valid frame is automatically saved as a JSON file when pose detection starts.

## Future Enhancements

- Jump detection logic
- Vertical velocity estimation
- Force approximation
- More sophisticated action detection

