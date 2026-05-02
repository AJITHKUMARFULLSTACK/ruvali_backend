const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');

const UPLOAD_SEGMENT = `/uploads/products`;
const CATEGORY_UPLOAD_SEGMENT = `/uploads/categories`;

/** Absolute directory for product images (filesystem). Exported for multer. */
function getProductUploadsDir() {
  return path.join(__dirname, '..', 'public', 'uploads', 'products');
}

function getCategoryUploadsDir() {
  return path.join(__dirname, '..', 'public', 'uploads', 'categories');
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
  if (!imageUrl || typeof imageUrl !== 'string') return '';
  const trimmed = imageUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const rel = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
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

/**
 * Relative URL stored in categories.bannerImage, e.g. /uploads/categories/foo.jpg
 */
function toPublicCategoryBannerUrl(fileName) {
  const base = path.basename(fileName);
  if (!base || base.includes('..')) {
    throw new Error('Invalid file name');
  }
  return `${CATEGORY_UPLOAD_SEGMENT}/${base}`;
}

function resolveCategoryBannerPath(bannerUrl) {
  if (!bannerUrl || typeof bannerUrl !== 'string') {
    throw new Error('Invalid banner path');
  }
  const normalized = bannerUrl.trim().replace(/\\/g, '/');
  if (normalized.includes('..')) {
    throw new Error('Invalid banner path');
  }
  if (!normalized.startsWith(`${CATEGORY_UPLOAD_SEGMENT}/`)) {
    throw new Error('Banner path is not under category uploads');
  }
  const fileName = path.basename(normalized);
  if (!fileName || fileName !== normalized.slice(CATEGORY_UPLOAD_SEGMENT.length + 1)) {
    throw new Error('Invalid banner path');
  }
  return path.join(getCategoryUploadsDir(), fileName);
}

/** Delete disk file only for paths under our category uploads (not Cloudinary/external). */
function deleteCategoryBannerIfExists(bannerUrl) {
  try {
    if (!bannerUrl || typeof bannerUrl !== 'string') return;
    if (!bannerUrl.startsWith(`${CATEGORY_UPLOAD_SEGMENT}/`)) return;
    const abs = resolveCategoryBannerPath(bannerUrl);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[uploads] Category banner missing on disk, skipping delete:', bannerUrl);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[uploads] Could not delete category banner file:', bannerUrl, err.message);
  }
}

function enrichCategoryForApi(cat) {
  if (!cat) return cat;
  const bannerImage = cat.bannerImage ?? null;
  return {
    ...cat,
    fullBannerImageUrl: bannerImage ? toFullImageUrl(bannerImage) : null,
  };
}

module.exports = {
  UPLOAD_SEGMENT,
  CATEGORY_UPLOAD_SEGMENT,
  getProductUploadsDir,
  getCategoryUploadsDir,
  toPublicUploadUrl,
  resolveUploadPath,
  deleteFileIfExists,
  deleteFilesIfExist,
  toPublicCategoryBannerUrl,
  resolveCategoryBannerPath,
  deleteCategoryBannerIfExists,
  toFullImageUrl,
  mapImageRowForApi,
  enrichCategoryForApi,
};
