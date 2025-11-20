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
    if (!this.filters[key]) {
      if (this.smoothingMethod === 'kalman') {
        // Use provided parameters or fall back to calculated values
        const pNoise = this.processNoise !== null ? this.processNoise : (this.smoothingFactor * 0.1);
        const mNoise = this.measurementNoise !== null ? this.measurementNoise : (this.smoothingFactor * 0.5);
        this.filters[key] = new KalmanFilter(pNoise, mNoise);
      } else {
        this.filters[key] = new ExponentialMovingAverage(this.smoothingFactor);
      }
    }
    return this.filters[key];
  }
  
  smoothAngles(angles) {
    if (!angles) return null;
    
    const smoothed = {};
    for (const [key, value] of Object.entries(angles)) {
      // Only smooth valid angles (not null, not NaN, is a number)
      if (value !== null && typeof value === 'number' && !isNaN(value)) {
        const filter = this.getFilter(key);
        smoothed[key] = filter.update(value);
      } else {
        // Reset filter for invalid values
        if (this.filters[key]) {
          this.filters[key].reset();
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
    
    const smoothed = {};
    for (const [key, orientation] of Object.entries(orientations)) {
      if (!orientation || orientation === null) {
        // Reset filters for this orientation segment
        const angleKey = `${key}_angle`;
        const xKey = `${key}_x`;
        const yKey = `${key}_y`;
        const zKey = `${key}_z`;
        if (this.filters[angleKey]) this.filters[angleKey].reset();
        if (this.filters[xKey]) this.filters[xKey].reset();
        if (this.filters[yKey]) this.filters[yKey].reset();
        if (this.filters[zKey]) this.filters[zKey].reset();
        smoothed[key] = null;
        continue;
      }
      
      // Smooth angle property
      let smoothedAngle = orientation.angle;
      if (orientation.angle !== null && orientation.angle !== undefined && 
          typeof orientation.angle === 'number' && !isNaN(orientation.angle)) {
        const angleFilter = this.getFilter(`${key}_angle`);
        smoothedAngle = angleFilter.update(orientation.angle);
      }
      
      // Smooth direction vector components (x, y, z)
      let smoothedX = orientation.x;
      let smoothedY = orientation.y;
      let smoothedZ = orientation.z;
      
      if (orientation.x !== null && orientation.x !== undefined && 
          typeof orientation.x === 'number' && !isNaN(orientation.x)) {
        const xFilter = this.getFilter(`${key}_x`);
        smoothedX = xFilter.update(orientation.x);
      }
      
      if (orientation.y !== null && orientation.y !== undefined && 
          typeof orientation.y === 'number' && !isNaN(orientation.y)) {
        const yFilter = this.getFilter(`${key}_y`);
        smoothedY = yFilter.update(orientation.y);
      }
      
      if (orientation.z !== null && orientation.z !== undefined && 
          typeof orientation.z === 'number' && !isNaN(orientation.z)) {
        const zFilter = this.getFilter(`${key}_z`);
        smoothedZ = zFilter.update(orientation.z);
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
    
    // Initialize smoothed landmarks if needed
    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== landmarks.length) {
      this.smoothedLandmarks = landmarks.map(l => ({ ...l }));
      return landmarks;
    }
    
    const smoothed = landmarks.map((landmark, index) => {
      const prev = this.smoothedLandmarks[index];
      
      if (this.useKalman) {
        // Use Kalman filter for each coordinate (better smoothing)
        return {
          x: this.getKalmanFilter(index, 'x').update(landmark.x),
          y: this.getKalmanFilter(index, 'y').update(landmark.y),
          z: this.getKalmanFilter(index, 'z').update(landmark.z || 0),
          visibility: landmark.visibility || prev.visibility
        };
      } else {
        // Use EMA (simpler, faster)
        return {
          x: this.alpha * landmark.x + (1 - this.alpha) * prev.x,
          y: this.alpha * landmark.y + (1 - this.alpha) * prev.y,
          z: this.alpha * (landmark.z || 0) + (1 - this.alpha) * (prev.z || 0),
          visibility: landmark.visibility || prev.visibility
        };
      }
    });
    
    // Update stored smoothed landmarks
    this.smoothedLandmarks = smoothed;
    return smoothed;
  }
  
  reset() {
    this.smoothedLandmarks = null;
    this.kalmanFilters = {};
  }
}

