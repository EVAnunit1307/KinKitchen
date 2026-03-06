const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function upload(localPath) {
  const result = await cloudinary.uploader.upload(localPath, { resource_type: 'auto' });
  return { url: result.secure_url, publicId: result.public_id };
}

module.exports = { upload };
