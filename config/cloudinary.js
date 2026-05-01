const cloudinary = require('cloudinary').v2;
const { env } = require('./env');

function isCloudinaryConfigured() {
  return Boolean(
    env.cloudinary.cloudName &&
    env.cloudinary.apiKey &&
    env.cloudinary.apiSecret &&
    env.cloudinary.cloudName.trim() !== '' &&
    env.cloudinary.apiKey.trim() !== '' &&
    env.cloudinary.apiSecret.trim() !== ''
  );
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) {
    if (env.nodeEnv === 'production') {
      // eslint-disable-next-line no-console
      console.warn(
        '[Cloudinary] WARNING: Cloudinary is not configured. Image uploads will fail in production.'
      );
    }
    return;
  }
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret
  });
}

module.exports = { cloudinary, configureCloudinary, isCloudinaryConfigured };

