/**
 * Exponential Moving Average (EMA) filter for smoothing values
 */
export class ExponentialMovingAverage {
  constructor(alpha = 0.3) {
    this.alpha = alpha; // Smoothing factor (0-1), lower = more smoothing
    this.value = null;
  }
  
  update(newValue) {
    // Only update with valid numbers
    if (newValue === null || newValue === undefined || isNaN(newValue)) {
      return null;
    }
    
    if (this.value === null) {
      this.value = newValue;
    } else {
      this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    }
    return this.value;
  }
  
  reset() {
    this.value = null;
  }
}

/**
 * Kalman filter for 1D values (simplified)
 */
export class KalmanFilter {
  constructor(processNoise = 0.01, measurementNoise = 0.25) {
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.estimatedValue = null;
    this.estimatedError = 1.0;
  }
  
  update(measurement) {
    // Only update with valid numbers
    if (measurement === null || measurement === undefined || isNaN(measurement)) {
      return null;
    }
    
    if (this.estimatedValue === null) {
      this.estimatedValue = measurement;
      return measurement;
    }
    
    // Prediction
    const predictionError = this.estimatedError + this.processNoise;
    
    // Update
    const kalmanGain = predictionError / (predictionError + this.measurementNoise);
    this.estimatedValue = this.estimatedValue + kalmanGain * (measurement - this.estimatedValue);
    this.estimatedError = (1 - kalmanGain) * predictionError;
    
    return this.estimatedValue;
  }
  
  reset() {
    this.estimatedValue = null;
    this.estimatedError = 1.0;
  }
}

/**
 * Smoothing manager for pose angles
 */
export class AngleSmoother {
  constructor(smoothingMethod = 'ema', smoothingFactor = 0.3, processNoise = null, measurementNoise = null) {
    this.smoothingMethod = smoothingMethod;
    this.smoothingFactor = smoothingFactor;
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.filters = {};
  }
  
  getFilter(key) {
    // Use Map for better performance with frequent lookups
    let filter = this.filters[key];
    if (!filter) {
      if (this.smoothingMethod === 'kalman') {
        // Use provided parameters or fall back to calculated values
        const pNoise = this.processNoise !== null ? this.processNoise : (this.smoothingFactor * 0.1);
        const mNoise = this.measurementNoise !== null ? this.measurementNoise : (this.smoothingFactor * 0.5);
        filter = new KalmanFilter(pNoise, mNoise);
      } else {
        filter = new ExponentialMovingAverage(this.smoothingFactor);
      }
      this.filters[key] = filter;
    }
    return filter;
  }
  
  smoothAngles(angles) {
    if (!angles) return null;
    
    // Pre-allocate object with known keys for better performance
    const smoothed = {};
    const keys = Object.keys(angles);
    const keysLength = keys.length;
    
    // Use for loop instead of for...of for better performance
    for (let i = 0; i < keysLength; i++) {
      const key = keys[i];
      const value = angles[key];
      
      // Only smooth valid angles (not null, not NaN, is a number)
      if (value !== null && typeof value === 'number' && !isNaN(value)) {
        const filter = this.getFilter(key);
        smoothed[key] = filter.update(value);
      } else {
        // Reset filter for invalid values
        const filter = this.filters[key];
        if (filter) {
          filter.reset();
        }
        smoothed[key] = null;
      }
    }
    return smoothed;
  }
  
  /**
   * Smooth orientations (objects with {x, y, z, angle, magnitude})
   * Smooths the angle property and direction vector components
   */
  smoothOrientations(orientations) {
    if (!orientations) return null;
    
    // Pre-allocate object for better performance
    const smoothed = {};
    const keys = Object.keys(orientations);
    const keysLength = keys.length;
    
    // Use for loop instead of for...of for better performance
    for (let i = 0; i < keysLength; i++) {
      const key = keys[i];
      const orientation = orientations[key];
      
      if (!orientation || orientation === null) {
        // Reset filters for this orientation segment
        const angleKey = `${key}_angle`;
        const xKey = `${key}_x`;
        const yKey = `${key}_y`;
        const zKey = `${key}_z`;
        const angleFilter = this.filters[angleKey];
        const xFilter = this.filters[xKey];
        const yFilter = this.filters[yKey];
        const zFilter = this.filters[zKey];
        if (angleFilter) angleFilter.reset();
        if (xFilter) xFilter.reset();
        if (yFilter) yFilter.reset();
        if (zFilter) zFilter.reset();
        smoothed[key] = null;
        continue;
      }
      
      // Smooth angle property
      let smoothedAngle = orientation.angle;
      const angle = orientation.angle;
      if (angle !== null && angle !== undefined && typeof angle === 'number' && !isNaN(angle)) {
        smoothedAngle = this.getFilter(`${key}_angle`).update(angle);
      }
      
      // Smooth direction vector components (x, y, z)
      let smoothedX = orientation.x;
      let smoothedY = orientation.y;
      let smoothedZ = orientation.z;
      
      const x = orientation.x;
      if (x !== null && x !== undefined && typeof x === 'number' && !isNaN(x)) {
        smoothedX = this.getFilter(`${key}_x`).update(x);
      }
      
      const y = orientation.y;
      if (y !== null && y !== undefined && typeof y === 'number' && !isNaN(y)) {
        smoothedY = this.getFilter(`${key}_y`).update(y);
      }
      
      const z = orientation.z;
      if (z !== null && z !== undefined && typeof z === 'number' && !isNaN(z)) {
        smoothedZ = this.getFilter(`${key}_z`).update(z);
      }
      
      // Reconstruct smoothed orientation object
      smoothed[key] = {
        x: smoothedX,
        y: smoothedY,
        z: smoothedZ,
        angle: smoothedAngle,
        magnitude: orientation.magnitude // Keep original magnitude
      };
    }
    return smoothed;
  }
  
  reset() {
    Object.values(this.filters).forEach(filter => filter.reset());
    this.filters = {};
  }
}

/**
 * Smooth landmarks using EMA or Kalman filter
 */
export class LandmarkSmoother {
  constructor(alpha = 0.5, useKalman = false, processNoise = 0.005, measurementNoise = 0.15) {
    this.alpha = alpha;
    this.useKalman = useKalman;
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.smoothedLandmarks = null;
    // Per-landmark, per-coordinate Kalman filters
    this.kalmanFilters = {};
  }
  
  getKalmanFilter(landmarkIndex, coordinate) {
    const key = `${landmarkIndex}_${coordinate}`;
    if (!this.kalmanFilters[key]) {
      this.kalmanFilters[key] = new KalmanFilter(this.processNoise, this.measurementNoise);
    }
    return this.kalmanFilters[key];
  }
  
  smooth(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      return landmarks;
    }
    
    const landmarksLength = landmarks.length;
    
    // Initialize smoothed landmarks if needed
    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== landmarksLength) {
      // Pre-allocate array for better performance
      this.smoothedLandmarks = new Array(landmarksLength);
      for (let i = 0; i < landmarksLength; i++) {
        const l = landmarks[i];
        this.smoothedLandmarks[i] = {
          x: l.x,
          y: l.y,
          z: l.z || 0,
          visibility: l.visibility
        };
      }
      return landmarks;
    }
    
    // Pre-allocate array for better performance
    const smoothed = new Array(landmarksLength);
    const oneMinusAlpha = 1 - this.alpha;
    
    if (this.useKalman) {
      // Use Kalman filter for each coordinate (better smoothing)
      for (let i = 0; i < landmarksLength; i++) {
        const landmark = landmarks[i];
        const prev = this.smoothedLandmarks[i];
        smoothed[i] = {
          x: this.getKalmanFilter(i, 'x').update(landmark.x),
          y: this.getKalmanFilter(i, 'y').update(landmark.y),
          z: this.getKalmanFilter(i, 'z').update(landmark.z || 0),
          visibility: landmark.visibility || prev.visibility
        };
      }
    } else {
      // Use EMA (simpler, faster) - optimized loop
      for (let i = 0; i < landmarksLength; i++) {
        const landmark = landmarks[i];
        const prev = this.smoothedLandmarks[i];
        const prevZ = prev.z || 0;
        const landmarkZ = landmark.z || 0;
        smoothed[i] = {
          x: this.alpha * landmark.x + oneMinusAlpha * prev.x,
          y: this.alpha * landmark.y + oneMinusAlpha * prev.y,
          z: this.alpha * landmarkZ + oneMinusAlpha * prevZ,
          visibility: landmark.visibility || prev.visibility
        };
      }
    }
    
    // Update stored smoothed landmarks
    this.smoothedLandmarks = smoothed;
    return smoothed;
  }
  
  reset() {
    this.smoothedLandmarks = null;
    this.kalmanFilters = {};
  }
}

