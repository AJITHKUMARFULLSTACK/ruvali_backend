const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');

const UPLOAD_SEGMENT = `/uploads/products`;

/** Absolute directory for product images (filesystem). Exported for multer. */
function getProductUploadsDir() {
  return path.join(__dirname, '..', 'public', 'uploads', 'products');
}

/**
 * DB path for a stored filename (leading slash, no traversal).
 * @param {string} fileName - basename only
 */
function toPublicUploadUrl(fileName) {
  const base = path.basename(fileName);
  if (!base || base.includes('..')) {
    throw new Error('Invalid file name');
  }
  return `${UPLOAD_SEGMENT}/${base}`;
}

/**
 * Resolve DB imageUrl to absolute filesystem path.
 * Only allows paths under public/uploads/products/.
 * @param {string} imageUrl e.g. /uploads/products/foo.jpg
 */
function resolveUploadPath(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid imageUrl');
  }
  const normalized = imageUrl.trim().replace(/\\/g, '/');
  if (normalized.includes('..')) {
    throw new Error('Invalid image path');
  }
  if (!normalized.startsWith(`${UPLOAD_SEGMENT}/`)) {
    throw new Error('Image path is not under product uploads');
  }
  const fileName = path.basename(normalized);
  if (!fileName || fileName !== normalized.slice(UPLOAD_SEGMENT.length + 1)) {
    throw new Error('Invalid image path');
  }
  return path.join(getProductUploadsDir(), fileName);
}

/**
 * Delete file for a DB-stored imageUrl; warn if missing; never throws for missing file.
 * @param {string} imageUrl
 */
function deleteFileIfExists(imageUrl) {
  try {
    const abs = resolveUploadPath(imageUrl);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[uploads] Image file missing on disk, skipping delete:', imageUrl);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[uploads] Could not delete image file:', imageUrl, err.message);
  }
}

function deleteFilesIfExist(urls) {
  if (!Array.isArray(urls)) return;
  for (const u of urls) {
    if (u) deleteFileIfExists(u);
  }
}

/**
 * Build full URL for API responses.
 * @param {string} imageUrl relative path starting with /
 */
function toFullImageUrl(imageUrl) {
  if (!imageUrl) return '';
  const rel = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  const base = (env.publicBaseUrl || '').replace(/\/$/, '');
  if (!base) return rel;
  return `${base}${rel}`;
}

function mapImageRowForApi(row) {
  const imageUrl = row.imageUrl;
  const primary =
    Boolean(row.isPrimary) === true || Number(row.isPrimary) === 1;
  return {
    id: row.id != null ? row.id : null,
    imageUrl,
    isPrimary: primary,
    fullImageUrl: toFullImageUrl(imageUrl),
  };
}

module.exports = {
  UPLOAD_SEGMENT,
  getProductUploadsDir,
  toPublicUploadUrl,
  resolveUploadPath,
  deleteFileIfExists,
  deleteFilesIfExist,
  toFullImageUrl,
  mapImageRowForApi,
};
