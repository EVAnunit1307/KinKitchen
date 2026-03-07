const { isFoodLabel, MIN_CONFIDENCE } = require('./food-filter');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function upload(localPath) {
  const result = await cloudinary.uploader.upload(localPath, { 
    resource_type: 'auto', 
    detection: 'lvis' 
  });

  // Extract bounding boxes from LVIS detection
  // Structure: result.info.detection.object_detection.data.lvis.tags = { "label": [{ "bounding-box": [x,y,w,h], confidence, categories }] }
  const tags = result.info?.detection?.object_detection?.data?.lvis?.tags || {};
  const boundingBoxes = [];
  for (const [label, detections] of Object.entries(tags)) {
    if (!isFoodLabel(label)) continue;
    if (Array.isArray(detections)) {
      for (const det of detections) {
        if (det.confidence < MIN_CONFIDENCE) continue;
        const bb = det['bounding-box'];
        boundingBoxes.push({
          name: label,
          confidence: det.confidence,
          categories: det.categories,
          x: bb?.[0],
          y: bb?.[1],
          w: bb?.[2],
          h: bb?.[3],
        });
      }
    }
  }

  return { 
    url: result.secure_url, 
    publicId: result.public_id,
    boundingBoxes 
  };
}

module.exports = { upload };