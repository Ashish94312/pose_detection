// Pose landmark connections for drawing
export const POSE_CONNECTIONS = [
  // Face
  [10, 9], [9, 0], [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  // Upper body
  [12, 11], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [16, 14], [14, 12], [12, 24], [11, 23],
  // Lower body
  [24, 26], [26, 28], [28, 30], [28, 32],
  [23, 25], [25, 27], [27, 29], [27, 31],
  // Torso
  [24, 23]
];

export const DRAWING_STYLES = {
  connectionColor: '#00FF00',
  connectionWidth: 2,
  landmarkColor: '#FF0000',
  landmarkRadius: 3,
};

/**
 * Draws pose landmarks and connections on canvas
 * Note: Does not clear the canvas - assumes video frame is already drawn
 * @param {Array} landmarks - Array of pose landmarks
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 */
export const drawPose = (landmarks, canvas, ctx) => {
  if (!landmarks || landmarks.length === 0) {
    return;
  }

  // Draw connections
  ctx.strokeStyle = DRAWING_STYLES.connectionColor;
  ctx.lineWidth = DRAWING_STYLES.connectionWidth;

  POSE_CONNECTIONS.forEach(([start, end]) => {
    if (landmarks[start] && landmarks[end]) {
      ctx.beginPath();
      ctx.moveTo(
        landmarks[start].x * canvas.width,
        landmarks[start].y * canvas.height
      );
      ctx.lineTo(
        landmarks[end].x * canvas.width,
        landmarks[end].y * canvas.height
      );
      ctx.stroke();
    }
  });

  // Draw landmarks
  ctx.fillStyle = DRAWING_STYLES.landmarkColor;
  landmarks.forEach((landmark) => {
    ctx.beginPath();
    ctx.arc(
      landmark.x * canvas.width,
      landmark.y * canvas.height,
      DRAWING_STYLES.landmarkRadius,
      0,
      2 * Math.PI
    );
    ctx.fill();
  });
};

