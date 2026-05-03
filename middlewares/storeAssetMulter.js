const multer = require('multer');
const path = require('path');
const { randomBytes } = require('crypto');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');
const { getStoreAssetsDir } = require('../utils/fileUrl');

const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExt.has(ext)) {
    cb(new HttpError(400, `Invalid image type "${ext}". Allowed: jpg, jpeg, png, webp.`));
    return;
  }
  cb(null, true);
}

function makeStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, getStoreAssetsDir());
    },
    filename: (req, file, cb) => {
      const slug = (req.store && req.store.slug) || req.adminUser?.storeId || 'store';
      const safeSlug = `${slug}`.replace(/[^\w.-]+/g, '_').slice(0, 64);
      const ext = path.extname(file.originalname || '').toLowerCase();
      const rand = randomBytes(8).toString('hex');
      cb(null, `store_${safeSlug}_${Date.now()}_${rand}${ext}`);
    },
  });
}

const instance = multer({
  storage: makeStorage(),
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
  fileFilter,
});

function wrap(mw) {
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (!err) return next();
      if (err instanceof HttpError) return next(err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(400, `Image must be at most ${env.maxUploadSizeMb} MB`));
      }
      return next(new HttpError(400, err.message || 'Upload failed'));
    });
  };
}

/** multipart field name: image — same convention as legacy /api/upload/image */
module.exports = {
  uploadStoreAssetSingle: wrap(instance.single('image')),
};
