/**
 * Unit tests for PubSub
 */

import { PubSub, posePubSub } from './pubsub';

describe('PubSub', () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new PubSub();
  });

  describe('Subscription Management', () => {
    test('should subscribe and return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = pubsub.subscribe(callback);
      
      expect(typeof unsubscribe).toBe('function');
      expect(pubsub.getSubscriberCount()).toBe(1);
    });

    test('should unsubscribe when unsubscribe function is called', () => {
      const callback = jest.fn();
      const unsubscribe = pubsub.subscribe(callback);
      
      expect(pubsub.getSubscriberCount()).toBe(1);
      unsubscribe();
      expect(pubsub.getSubscriberCount()).toBe(0);
    });

    test('should handle multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();
      
      pubsub.subscribe(callback1);
      pubsub.subscribe(callback2);
      pubsub.subscribe(callback3);
      
      expect(pubsub.getSubscriberCount()).toBe(3);
    });

    test('should allow unsubscribing specific subscriber', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      const unsubscribe1 = pubsub.subscribe(callback1);
      pubsub.subscribe(callback2);
      
      unsubscribe1();
      
      expect(pubsub.getSubscriberCount()).toBe(1);
    });
  });

  describe('Publishing', () => {
    test('should publish data to all subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      pubsub.subscribe(callback1);
      pubsub.subscribe(callback2);
      
      const testData = { timestamp: 1000, joints: {} };
      pubsub.publish(testData);
      
      expect(callback1).toHaveBeenCalledWith(testData);
      expect(callback2).toHaveBeenCalledWith(testData);
    });

    test('should not publish to unsubscribed callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      const unsubscribe1 = pubsub.subscribe(callback1);
      pubsub.subscribe(callback2);
      
      unsubscribe1();
      
      const testData = { timestamp: 1000 };
      pubsub.publish(testData);
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(testData);
    });

    test('should handle errors in subscribers gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const callback1 = jest.fn(() => {
        throw new Error('Test error');
      });
      const callback2 = jest.fn();
      
      pubsub.subscribe(callback1);
      pubsub.subscribe(callback2);
      
      const testData = { timestamp: 1000 };
      pubsub.publish(testData);
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled(); // Should still call other subscribers
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Subscriber Count', () => {
    test('should return correct subscriber count', () => {
      expect(pubsub.getSubscriberCount()).toBe(0);
      
      pubsub.subscribe(jest.fn());
      expect(pubsub.getSubscriberCount()).toBe(1);
      
      pubsub.subscribe(jest.fn());
      expect(pubsub.getSubscriberCount()).toBe(2);
    });
  });

  describe('Clear', () => {
    test('should clear all subscribers', () => {
      pubsub.subscribe(jest.fn());
      pubsub.subscribe(jest.fn());
      pubsub.subscribe(jest.fn());
      
      expect(pubsub.getSubscriberCount()).toBe(3);
      
      pubsub.clear();
      expect(pubsub.getSubscriberCount()).toBe(0);
    });
  });
});

describe('posePubSub Singleton', () => {
  test('should be an instance of PubSub', () => {
    expect(posePubSub).toBeInstanceOf(PubSub);
  });

  test('should support subscription', () => {
    const callback = jest.fn();
    const unsubscribe = posePubSub.subscribe(callback);
    
    expect(typeof unsubscribe).toBe('function');
    
    posePubSub.publish({ test: 'data' });
    expect(callback).toHaveBeenCalledWith({ test: 'data' });
    
    unsubscribe();
  });
});

