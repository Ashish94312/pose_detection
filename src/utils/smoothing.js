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
  constructor(smoothingMethod = 'ema', smoothingFactor = 0.3) {
    this.smoothingMethod = smoothingMethod;
    this.smoothingFactor = smoothingFactor;
    this.filters = {};
  }
  
  getFilter(key) {
    if (!this.filters[key]) {
      if (this.smoothingMethod === 'kalman') {
        this.filters[key] = new KalmanFilter(
          this.smoothingFactor * 0.1,
          this.smoothingFactor * 0.5
        );
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
  
  reset() {
    Object.values(this.filters).forEach(filter => filter.reset());
    this.filters = {};
  }
}

/**
 * Smooth landmarks using EMA
 */
export class LandmarkSmoother {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.smoothedLandmarks = null;
  }
  
  smooth(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      return landmarks;
    }
    
    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== landmarks.length) {
      this.smoothedLandmarks = landmarks.map(l => ({ ...l }));
      return landmarks;
    }
    
    const smoothed = landmarks.map((landmark, index) => {
      const prev = this.smoothedLandmarks[index];
      return {
        x: this.alpha * landmark.x + (1 - this.alpha) * prev.x,
        y: this.alpha * landmark.y + (1 - this.alpha) * prev.y,
        z: this.alpha * (landmark.z || 0) + (1 - this.alpha) * (prev.z || 0),
        visibility: landmark.visibility || prev.visibility
      };
    });
    
    // Update stored smoothed landmarks
    this.smoothedLandmarks = smoothed;
    return smoothed;
  }
  
  reset() {
    this.smoothedLandmarks = null;
  }
}

