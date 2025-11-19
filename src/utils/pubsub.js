/**
 * Simple Pub/Sub mechanism for pose data
 */

class PubSub {
  constructor() {
    this.subscribers = new Map();
    this.subscriberId = 0;
  }

  /**
   * Subscribe to pose data updates
   * @param {Function} callback - Callback function to receive pose data
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    const id = this.subscriberId++;
    this.subscribers.set(id, callback);
    
    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * Publish pose data to all subscribers
   * @param {Object} data - Pose data to publish
   */
  publish(data) {
    this.subscribers.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in pub/sub subscriber:', error);
      }
    });
  }

  /**
   * Get number of active subscribers
   * @returns {number} Number of subscribers
   */
  getSubscriberCount() {
    return this.subscribers.size;
  }

  /**
   * Clear all subscribers
   */
  clear() {
    this.subscribers.clear();
  }
}

// Singleton instance
export const posePubSub = new PubSub();

// Export class for testing
export { PubSub };

