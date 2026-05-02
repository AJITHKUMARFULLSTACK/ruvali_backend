const multer = require('multer');
const path = require('path');
const { randomBytes } = require('crypto');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');
const { getProductUploadsDir } = require('../utils/fileUrl');

function allowedExtensions() {
  return new Set(['.jpg', '.jpeg', '.png', '.webp']);
}

function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExtensions().has(ext)) {
    cb(new HttpError(400, `Invalid image type "${ext}". Allowed: jpg, jpeg, png, webp.`));
    return;
  }
  cb(null, true);
}

function makeDiskStorage(resolveProductId) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, getProductUploadsDir());
    },
    filename: (req, file, cb) => {
      const productId = resolveProductId(req);
      const ext = path.extname(file.originalname || '').toLowerCase();
      const rand = randomBytes(8).toString('hex');
      cb(null, `product_${productId}_${Date.now()}_${rand}${ext}`);
    },
  });
}

/** Accept `images` and `images[]` (frontend convention). Normalizes `req.files` to a flat array. */
function createProductImagesUploader(resolveProductId) {
  const instance = multer({
    storage: makeDiskStorage(resolveProductId),
    limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
    fileFilter: imageFileFilter,
  });

  const fieldsMw = instance.fields([
    { name: 'images', maxCount: 24 },
    { name: 'images[]', maxCount: 24 },
  ]);

  return (req, res, next) => {
    fieldsMw(req, res, (err) => {
      if (err) return next(err);
      const buckets = req.files;
      req.files = [].concat(
        buckets && buckets.images ? buckets.images : [],
        buckets && buckets['images[]'] ? buckets['images[]'] : []
      );
      next();
    });
  };
}

const uploadForExistingProduct = createProductImagesUploader(
  (req) => req.params.id || req.params.productId || 'unknown'
);

const uploadForCreateMultipart = createProductImagesUploader(
  (req) => req.preAssignedProductId || 'pending'
);

function wrapMulter(uploadMiddlewareInstance) {
  return (req, res, next) => {
    uploadMiddlewareInstance(req, res, (err) => {
      if (!err) return next();
      if (err instanceof HttpError) return next(err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(400, `Each image must be at most ${env.maxUploadSizeMb} MB`));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          new HttpError(
            400,
            'Unexpected upload field. Use fields `images` or `images[]` for multipart product uploads.'
          )
        );
      }
      return next(new HttpError(400, err.message || 'Upload failed'));
    });
  };
}

function assignProductIdBeforeMultipartUpload(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) return next();
  const { randomUUID } = require('crypto');
  req.preAssignedProductId = randomUUID();
  next();
}

module.exports = {
  uploadExistingProductImages: wrapMulter(uploadForExistingProduct),
  uploadCreateProductImages: wrapMulter(uploadForCreateMultipart),
  assignProductIdBeforeMultipartUpload,
};
