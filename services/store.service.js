const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { deleteStoreAssetIfExists } = require('../utils/fileUrl');

async function getStoreBySlug(slug) {
  const rows = await query('SELECT * FROM stores WHERE slug = ? LIMIT 1', [slug]);
  const store = rows[0];
  if (!store) throw new HttpError(404, 'Store not found');
  return store;
}

async function updateStoreBranding(storeId, payload) {
  const existingRows = await query(
    'SELECT logo, backgroundImage FROM stores WHERE id = ? LIMIT 1',
    [storeId]
  );
  const previous = existingRows[0];
  if (!previous) throw new HttpError(404, 'Store not found');

  const data = {
    name: payload.name,
    logo: payload.logo,
    primaryColor: payload.primaryColor,
    secondaryColor: payload.secondaryColor,
    backgroundImage: payload.backgroundImage,
    whatsappNumber: payload.whatsappNumber,
    currency: payload.currency,
    themeMode: payload.themeMode
  };

  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  if ('logo' in data && previous.logo && data.logo !== previous.logo) {
    deleteStoreAssetIfExists(previous.logo);
  }
  if (
    'backgroundImage' in data &&
    previous.backgroundImage &&
    data.backgroundImage !== previous.backgroundImage
  ) {
    deleteStoreAssetIfExists(previous.backgroundImage);
  }

  const keys = Object.keys(data);
  if (keys.length === 0) {
    const rows = await query('SELECT * FROM stores WHERE id = ? LIMIT 1', [storeId]);
    if (!rows[0]) throw new HttpError(404, 'Store not found');
    return rows[0];
  }

  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => data[k]);

  await query(
    `UPDATE stores SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [...values, storeId]
  );
  const rows = await query('SELECT * FROM stores WHERE id = ? LIMIT 1', [storeId]);
  if (!rows[0]) throw new HttpError(404, 'Store not found');
  return rows[0];
}

module.exports = { getStoreBySlug, updateStoreBranding };

