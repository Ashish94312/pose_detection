/**
 * Performance Profiler Utility
 * Tracks execution time for different functions and components
 */

class PerformanceProfiler {
  constructor() {
    this.profiles = new Map(); // Map of function name -> profile data
    this.activeTimers = new Map(); // Map of timer ID -> start time
    this.enabled = true;
    this.maxSamples = 1000; // Maximum samples per function
  }

  /**
   * Start timing a function/component
   * @param {string} name - Name of the function/component to profile
   * @param {Object} metadata - Optional metadata (e.g., { jumpNumber: 1 })
   * @returns {string} Timer ID
   */
  start(name, metadata = {}) {
    if (!this.enabled) return null;

    const timerId = `${name}_${performance.now()}_${Math.random()}`;
    const startTime = performance.now();
    
    this.activeTimers.set(timerId, {
      name,
      startTime,
      metadata,
    });

    return timerId;
  }

  /**
   * End timing a function/component
   * @param {string} timerId - Timer ID returned from start()
   * @param {Object} additionalMetadata - Optional additional metadata
   */
  end(timerId, additionalMetadata = {}) {
    if (!this.enabled || !timerId) return;

    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      console.warn(`[Profiler] Timer ${timerId} not found`);
      return;
    }

    const endTime = performance.now();
    const duration = endTime - timer.startTime;

    // Get or create profile for this function
    if (!this.profiles.has(timer.name)) {
      this.profiles.set(timer.name, {
        name: timer.name,
        samples: [],
        totalCalls: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: -Infinity,
        avgTime: 0,
      });
    }

    const profile = this.profiles.get(timer.name);
    const sample = {
      duration,
      timestamp: endTime,
      metadata: { ...timer.metadata, ...additionalMetadata },
    };

    // Add sample
    profile.samples.push(sample);
    if (profile.samples.length > this.maxSamples) {
      profile.samples.shift(); // Remove oldest sample
    }

    // Update statistics
    profile.totalCalls++;
    profile.totalTime += duration;
    profile.minTime = Math.min(profile.minTime, duration);
    profile.maxTime = Math.max(profile.maxTime, duration);
    profile.avgTime = profile.totalTime / profile.totalCalls;

    // Clean up timer
    this.activeTimers.delete(timerId);

    return duration;
  }

  /**
   * Measure a function execution (wrapper)
   * @param {string} name - Name of the function
   * @param {Function} fn - Function to measure
   * @param {Object} metadata - Optional metadata
   * @returns {*} Function result
   */
  measure(name, fn, metadata = {}) {
    if (!this.enabled) {
      return fn();
    }

    const timerId = this.start(name, metadata);
    try {
      const result = fn();
      
      // Handle async functions
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            this.end(timerId, metadata);
            return value;
          },
          (error) => {
            this.end(timerId, { ...metadata, error: error.message });
            throw error;
          }
        );
      }
      
      this.end(timerId, metadata);
      return result;
    } catch (error) {
      this.end(timerId, { ...metadata, error: error.message });
      throw error;
    }
  }

  /**
   * Get profile for a specific function
   * @param {string} name - Function name
   * @returns {Object|null} Profile data
   */
  getProfile(name) {
    return this.profiles.get(name) || null;
  }

  /**
   * Get all profiles
   * @returns {Array} Array of profile objects
   */
  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const profiles = this.getAllProfiles();
    const summary = {
      totalFunctions: profiles.length,
      totalCalls: 0,
      totalTime: 0,
      functions: profiles.map((p) => ({
        name: p.name,
        calls: p.totalCalls,
        totalTime: p.totalTime,
        avgTime: p.avgTime,
        minTime: p.minTime,
        maxTime: p.maxTime,
        percentage: 0, // Will be calculated below
      })),
    };

    // Calculate total time and percentages
    summary.totalCalls = profiles.reduce((sum, p) => sum + p.totalCalls, 0);
    summary.totalTime = profiles.reduce((sum, p) => sum + p.totalTime, 0);

    // Calculate percentage of total time for each function
    if (summary.totalTime > 0) {
      summary.functions.forEach((f) => {
        f.percentage = (f.totalTime / summary.totalTime) * 100;
      });
    }

    // Sort by total time (descending)
    summary.functions.sort((a, b) => b.totalTime - a.totalTime);

    return summary;
  }

  /**
   * Get recent samples for a function
   * @param {string} name - Function name
   * @param {number} count - Number of recent samples to return
   * @returns {Array} Recent samples
   */
  getRecentSamples(name, count = 10) {
    const profile = this.profiles.get(name);
    if (!profile) return [];

    return profile.samples.slice(-count);
  }

  /**
   * Reset all profiles
   */
  reset() {
    this.profiles.clear();
    this.activeTimers.clear();
  }

  /**
   * Reset profile for a specific function
   * @param {string} name - Function name
   */
  resetFunction(name) {
    this.profiles.delete(name);
  }

  /**
   * Enable/disable profiling
   * @param {boolean} enabled - Whether to enable profiling
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Check if profiling is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Export profiles as JSON
   * @returns {string} JSON string
   */
  exportJSON() {
    return JSON.stringify({
      summary: this.getSummary(),
      profiles: this.getAllProfiles(),
      timestamp: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Download profiles as JSON file
   */
  downloadJSON() {
    const json = this.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-profiles-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Create singleton instance
export const performanceProfiler = new PerformanceProfiler();

// Auto-enable by default
performanceProfiler.setEnabled(true);

