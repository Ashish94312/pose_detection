# Jump Detection Module

This module provides jump detection, landing detection, force calculation, and live UI widgets.

## Features

- **Jump Detection**: Detects when a person starts jumping
- **Landing Detection**: Detects when a person lands after a jump
- **Force Calculation**: Calculates approximate force based on vertical acceleration
- **Live UI Widgets**: Real-time display of jump statistics and force data

## How It Works

The module subscribes to the pose data feed via pub/sub and processes:
- Vertical velocity from hip center movement
- Jump start detection (upward velocity + crouch position)
- Landing detection (downward velocity after air time)
- Force approximation using acceleration calculations

## Usage

The module is automatically integrated into the main App. To use it programmatically:

```javascript
import { jumpDetector } from './jumpDetection';

// Subscribe to pose data
jumpDetector.subscribe();

// Set up callbacks
jumpDetector.onJumpDetected = (data) => {
  console.log('Jump detected!', data);
};

jumpDetector.onLandingDetected = (data) => {
  console.log('Landing detected!', data);
};

jumpDetector.onForceCalculated = (data) => {
  console.log('Force:', data.force);
};

// Get current state
const state = jumpDetector.getState();

// Unsubscribe when done
jumpDetector.unsubscribeFromFeed();
```

## Removing This Module

To remove the jump detection module:

1. **Delete the folder**: Remove the entire `src/jumpDetection/` folder
2. **Remove from App.js**: 
   - Remove the import: `import { JumpWidgets } from './jumpDetection';`
   - Remove the component: `<JumpWidgets />`

That's it! The rest of the application will continue to work normally.

## Force Calculation Method

The force is calculated using Newton's Second Law: **F = m × a**

### Steps:
1. **Vertical Velocity**: Calculated from hip center position change over time
   - `velocity = (previousY - currentY) / timeDelta`
   - Negative Y direction is upward (normalized coordinates)

2. **Acceleration**: Calculated from velocity change over time
   - `acceleration = (currentVelocity - previousVelocity) / timeDelta`
   - Converted from normalized to m/s² (assuming ~2m height range)

3. **Net Force**: Includes gravitational force
   - `F_net = m × (a_net + g)` where g = 9.81 m/s²
   - This gives the total force including gravity

### Mass Configuration

You can set the mass (in kg) for force calculations:

```javascript
import { jumpDetector } from './jumpDetection';

// Set mass (default is 70 kg)
jumpDetector.setMass(75); // kg

// Get current mass
const mass = jumpDetector.getMass();
```

Or use the UI: Click the "Mass: X kg" button to input your mass.

## Configuration

You can adjust detection thresholds in `jumpDetector.js`:

```javascript
this.config = {
  verticalVelocityThreshold: 0.15, // m/s (normalized)
  minJumpHeight: 0.05, // normalized height change
  landingVelocityThreshold: -0.1, // m/s (normalized)
  minAirTime: 100, // milliseconds
  mass: 70, // kg (can be set via UI or setMass())
};
```

## Data Structure

### Jump Detection Event
```javascript
{
  timestamp: 1234567890,
  jumpNumber: 1,
  startHeight: 0.5
}
```

### Landing Detection Event
```javascript
{
  timestamp: 1234567890,
  jumpNumber: 1,
  jumpHeight: 0.15,
  airTime: 450
}
```

### Force Data
```javascript
{
  verticalVelocity: 0.2,
  acceleration: 9.8,
  force: 686.7, // Newtons
  timestamp: 1234567890
}
```

