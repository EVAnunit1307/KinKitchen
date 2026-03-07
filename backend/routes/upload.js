const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { upload: uploadToCloudinary } = require('../services/cloudinary');
const { analyzeImageContent } = require('../services/cloudinary-analysis');
const { analyzeMedia } = require('../services/gemini');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const multerUpload = multer({ dest: `${UPLOAD_DIR}/`, limits: { fileSize: 100 * 1024 * 1024 } });

const router = express.Router();

router.post('/', multerUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const { url, publicId, boundingBoxes } = await uploadToCloudinary(req.file.path);
    fs.unlink(req.file.path, () => {});

    const mediaType = (req.file.mimetype || '').startsWith('video/') ? 'video' : 'image';
    let analysis = null;
    let analysisError = null;
    try {
      analysis = await analyzeMedia(url, mediaType);
    } catch (err) {
      analysisError = err.message || 'Analysis failed';
    }

    let contentAnalysis = null;
    if (mediaType === 'image') {
      try {
        contentAnalysis = await analyzeImageContent(url);
      } catch (err) {
        contentAnalysis = { error: err.message || 'Content analysis failed' };
      }
    }

    res.json({ url, publicId, mediaType, analysis, analysisError, contentAnalysis, boundingBoxes });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

module.exports = router;
