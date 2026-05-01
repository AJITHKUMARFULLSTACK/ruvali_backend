const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../utils/asyncHandler');
const { uploadImageBuffer } = require('../services/cloudinary.service');
const { HttpError } = require('../utils/httpError');
const { isCloudinaryConfigured } = require('../config/cloudinary');

const localUploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(localUploadDir)) fs.mkdirSync(localUploadDir, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({ storage });

const singleImageMiddleware = upload.single('image');

const isProduction = process.env.NODE_ENV === 'production';

/** Shared: upload buffer to Cloudinary or local (dev only), return URL */
async function uploadBufferToUrl({ buffer, originalname, storeSlug, storeId }) {
  const folder = `ruvali/${storeSlug || storeId || 'general'}`;

  if (isProduction && !isCloudinaryConfigured()) {
    throw new HttpError(
      503,
      'Image upload is not available. Cloudinary is not configured on this server.'
    );
  }

  try {
    const result = await uploadImageBuffer({
      buffer,
      filename: originalname,
      folder
    });
    return result.secure_url;
  } catch (err) {
    if (isProduction) {
      throw new HttpError(
        503,
        'Image upload is not available. Cloudinary is not configured on this server.'
      );
    }
    // eslint-disable-next-line no-console
    console.warn('[Upload] Cloudinary not configured — saving to local disk (dev only)');
    const ext = path.extname(originalname) || '.png';
    const safeName = `${Date.now()}${ext}`;
    const dest = path.join(localUploadDir, safeName);
    await fs.promises.writeFile(dest, buffer);
    return `/uploads/${safeName}`;
  }
}

const uploadImage = [
  singleImageMiddleware,
  asyncHandler(async (req, res) => {
    if (isProduction && !isCloudinaryConfigured()) {
      return res.status(503).json({
        error: 'Image upload is not available. Cloudinary is not configured on this server.'
      });
    }
    if (!req.file) throw new HttpError(400, 'No file provided under field name `image`');
    const url = await uploadBufferToUrl({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      storeSlug: req.store?.slug,
      storeId: req.adminUser.storeId
    });
    res.json({
      url,
      provider: url.startsWith('http') ? 'cloudinary' : 'local'
    });
  })
];

module.exports = { uploadImage, uploadBufferToUrl };

