import { useState, useRef, useCallback } from 'react';
import { VIDEO_CONFIG, DEFAULT_RESOLUTION } from '../config/poseConfig';

/**
 * Custom hook for managing video stream
 * @param {Object} resolution - Resolution config with width and height
 * @returns {Object} Video stream state and methods
 */
export const useVideoStream = (resolution = DEFAULT_RESOLUTION) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [actualResolution, setActualResolution] = useState(null);
  const videoRef = useRef(null);

  // Start video stream
  const startStream = useCallback(async () => {
    try {
      // Try exact constraints first for better control
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { exact: resolution.width },
            height: { exact: resolution.height },
            frameRate: { ideal: VIDEO_CONFIG.frameRate, min: 30 }
          }
        });
      } catch (exactError) {
        // Fall back to ideal constraints if exact fails
        console.log('Exact constraints not supported, using ideal constraints');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            frameRate: { ideal: VIDEO_CONFIG.frameRate, min: 30 }
          }
        });
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        return new Promise((resolve, reject) => {
          const video = videoRef.current;
          
          const handleLoadedMetadata = () => {
            // Get actual video resolution
            const actualWidth = video.videoWidth;
            const actualHeight = video.videoHeight;
            setActualResolution({ width: actualWidth, height: actualHeight });
            
            // Log resolution info
            console.log(`Requested resolution: ${resolution.width}x${resolution.height}`);
            console.log(`Actual video resolution: ${actualWidth}x${actualHeight}`);
            if (actualWidth !== resolution.width || actualHeight !== resolution.height) {
              console.warn(`Resolution mismatch! Requested ${resolution.width}x${resolution.height}, got ${actualWidth}x${actualHeight}`);
            }
            
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
  }, [resolution]);

  // Stop video stream
  const stopStream = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setActualResolution(null);
  }, []);

  return {
    videoRef,
    isStreaming,
    actualResolution,
    startStream,
    stopStream,
  };
};

