import { useRef, useImperativeHandle, forwardRef } from 'react';
import './VideoCanvas.css';

/**
 * VideoCanvas component - Displays video stream and pose detection overlay
 * @param {Object} props - Component props
 * @param {Object} props.videoRef - Ref to video element
 * @param {Object} canvasRef - Ref forwarded from parent to access canvas
 */
const VideoCanvas = forwardRef(({ videoRef }, canvasRef) => {
  const internalCanvasRef = useRef(null);

  useImperativeHandle(canvasRef, () => internalCanvasRef.current, []);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        className="video-element"
        playsInline
        muted
        style={{ display: 'none' }}
      />
      <canvas
        ref={internalCanvasRef}
        className="canvas-element"
        width={640}
        height={480}
      />
    </div>
  );
});

VideoCanvas.displayName = 'VideoCanvas';

export default VideoCanvas;

