/**
 * Utility to export sample pose data
 */

let sampleData = null;
let sampleCount = 0;

/**
 * Save a sample pose data
 * @param {Object} poseData - Pose data to save
 */
export const saveSample = (poseData) => {
  if (!poseData) return;
  
  // Save first valid sample
  if (sampleCount === 0 && poseData.joints && poseData.angles) {
    sampleData = JSON.parse(JSON.stringify(poseData)); // Deep clone
    sampleCount++;
    
    // Log to console
    console.log('=== SAMPLE POSE DATA SAVED ===');
    console.log(JSON.stringify(sampleData, null, 2));
    
    // Create downloadable file
    downloadSample(sampleData);
  }
};

/**
 * Download sample as JSON file
 * @param {Object} data - Data to download
 */
const downloadSample = (data) => {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pose_sample_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('Sample JSON file downloaded');
  } catch (error) {
    console.error('Error downloading sample:', error);
  }
};

/**
 * Get saved sample data
 * @returns {Object|null} Sample data
 */
export const getSample = () => {
  return sampleData;
};

/**
 * Reset sample data
 */
export const resetSample = () => {
  sampleData = null;
  sampleCount = 0;
};

