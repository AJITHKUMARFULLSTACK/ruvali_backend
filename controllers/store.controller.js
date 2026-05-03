const { asyncHandler } = require('../utils/asyncHandler');
const { getStoreBySlug, updateStoreBranding } = require('../services/store.service');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { uploadStoreAssetSingle } = require('../middlewares/storeAssetMulter');
const {
  toPublicStoreAssetUrl,
  toFullImageUrl,
} = require('../utils/fileUrl');

const getBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const store = await getStoreBySlug(slug);

  console.log('[STORE:getBySlug]', {
    slug,
    storeId: store.id
  });

  res.json(store);
});

// Admin-only: updates branding for current admin's store
const updateBranding = asyncHandler(async (req, res) => {
  const storeId = req.adminUser.storeId;
  const updated = await updateStoreBranding(storeId, req.body);

  console.log('[STORE:updateBranding]', {
    storeId,
    bodyKeys: Object.keys(req.body || {})
  });

  res.json(updated);
});

// Admin-only: touch store to bump updatedAt
const revalidate = asyncHandler(async (req, res) => {
  const storeId = req.adminUser.storeId;

  await query(
    'UPDATE stores SET name = name, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
    [storeId]
  );
  const rows = await query('SELECT id, updatedAt FROM stores WHERE id = ? LIMIT 1', [storeId]);
  const updated = rows[0];

  console.log('[STORE:revalidate]', {
    storeId,
    updatedAt: updated.updatedAt
  });

  res.json({ id: updated.id, updatedAt: updated.updatedAt });
});

/** POST /api/store/asset — logo/background uploads (local disk). Field name: image */
const uploadBrandingAsset = [
  uploadStoreAssetSingle,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'No file provided under field name `image`');
    }
    const relative = toPublicStoreAssetUrl(req.file.filename);
    const fullImageUrl = toFullImageUrl(relative);
    res.json({
      url: relative,
      imageUrl: relative,
      fullImageUrl,
      provider: 'local'
    });
  }),
];

module.exports = { getBySlug, updateBranding, revalidate, uploadBrandingAsset };

