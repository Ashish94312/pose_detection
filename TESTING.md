# Testing Guide

This guide explains how to run tests and what files have test coverage.

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode (Interactive)
```bash
npm test -- --watch
```

### Run Tests Once (CI Mode)
```bash
npm test -- --watchAll=false
```

### Run Specific Test File
```bash
npm test -- jumpDetector.test.js
```

### Run Tests with Coverage
```bash
npm test -- --coverage --watchAll=false
```

### Run Tests Matching a Pattern
```bash
npm test -- --testPathPattern=utils
```

## Test Files

### ✅ Currently Tested

1. **`src/jumpDetection/jumpDetector.test.js`** (47 tests)
   - Jump detection FSM
   - State transitions
   - Velocity and force calculations
   - Jump validation
   - Scale factor calculations

2. **`src/utils/pubsub.test.js`** (See below)
   - Pub/Sub subscription management
   - Message publishing
   - Error handling

3. **`src/utils/poseAngles.test.js`** (See below)
   - Angle calculations
   - Distance calculations
   - Visibility checks

4. **`src/utils/smoothing.test.js`** (See below)
   - EMA filter
   - Kalman filter
   - Angle smoothing

### 📝 Files That Need Tests

1. **Components** (React components)
   - `src/components/VideoCanvas.js`
   - `src/components/Controls.js`
   - `src/components/ModelSelector.js`
   - `src/components/AngleDisplay.js`
   - `src/components/StatusDisplay.js`
   - `src/components/PerformanceProfiler.js`
   - `src/jumpDetection/JumpWidgets.js`

2. **Hooks**
   - `src/hooks/usePoseDetection.js`
   - `src/hooks/useVideoStream.js`
   - `src/hooks/modelHandlers.js`

3. **Models**
   - `src/models/poseModelFactory.js`

4. **Utils**
   - `src/utils/poseDrawing.js`
   - `src/utils/poseSchema.js`
   - `src/utils/sampleExporter.js`
   - `src/utils/logger.js`
   - `src/utils/performanceProfiler.js`

5. **Workers**
   - `src/workers/workerManager.js`
   - `src/workers/blazePoseWorker.js`

6. **Config**
   - `src/config/poseConfig.js`

## Writing Tests

### Test File Naming
- Test files should be named `*.test.js` or `*.spec.js`
- Place test files next to the source file or in a `__tests__` folder

### Example Test Structure
```javascript
import { functionToTest } from './module';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test('should do something', () => {
    const result = functionToTest(input);
    expect(result).toBe(expected);
  });
});
```

### Testing React Components
```javascript
import { render, screen } from '@testing-library/react';
import Component from './Component';

test('renders component', () => {
  render(<Component />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

### Testing Async Code
```javascript
test('handles async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});
```

### Mocking Dependencies
```javascript
jest.mock('../utils/dependency');

import { dependency } from '../utils/dependency';
dependency.method = jest.fn(() => 'mocked value');
```

## Test Coverage Goals

- **Critical Paths**: 80%+ coverage
- **Utilities**: 90%+ coverage
- **Components**: 70%+ coverage
- **Hooks**: 80%+ coverage

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch

Make sure all tests pass before merging!

