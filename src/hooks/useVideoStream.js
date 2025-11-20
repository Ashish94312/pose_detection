import { useState, useRef, useCallback } from 'react';
import { VIDEO_CONFIG } from '../config/poseConfig';

/**
 * Custom hook for managing video stream
 * @returns {Object} Video stream state and methods
 */
export const useVideoStream = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRef = useRef(null);

  // Start video stream
  const startStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: VIDEO_CONFIG.width,
          height: VIDEO_CONFIG.height,
          frameRate: { ideal: VIDEO_CONFIG.frameRate ,min:30}
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        return new Promise((resolve, reject) => {
          const video = videoRef.current;
          
          const handleLoadedMetadata = () => {
            video.play()
              .then(() => {
                setIsStreaming(true);
                resolve(true);
              })
              .catch((err) => {
                console.error('Error playing video:', err);
                reject(new Error('Failed to start video playback'));
              });
          };
          
          if (video.readyState >= 1) {
            // Metadata already loaded
            handleLoadedMetadata();
          } else {
            video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
            video.addEventListener('error', (err) => {
              console.error('Video error:', err);
              reject(new Error('Video element error'));
            }, { once: true });
          }
        });
      }
      return false;
    } catch (error) {
      console.error('Error accessing webcam:', error);
      throw new Error('Failed to access webcam. Please grant camera permissions.');
    }
  }, []);

  // Stop video stream
  const stopStream = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    videoRef,
    isStreaming,
    startStream,
    stopStream,
  };
};

