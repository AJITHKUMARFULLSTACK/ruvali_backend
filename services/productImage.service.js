const { randomUUID } = require('crypto');
const path = require('path');
const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const {
  toPublicUploadUrl,
  mapImageRowForApi,
  deleteFileIfExists,
  deleteFilesIfExist,
} = require('../utils/fileUrl');

async function assertProductInStore(storeId, productId) {
  const rows = await query('SELECT id FROM products WHERE id = ? AND storeId = ? LIMIT 1', [
    productId,
    storeId,
  ]);
  if (!rows[0]) throw new HttpError(404, 'Product not found for this store');
}

async function fetchProductImages(productId) {
  return query(
    `SELECT id, productId, imageUrl, sortOrder, isPrimary, createdAt, updatedAt
     FROM product_images
     WHERE productId = ?
     ORDER BY sortOrder ASC, createdAt ASC`,
    [productId]
  );
}

async function fetchImagesGroupedByProductIds(productIds) {
  if (!productIds.length) return new Map();
  const ph = productIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT id, productId, imageUrl, sortOrder, isPrimary, createdAt, updatedAt
     FROM product_images
     WHERE productId IN (${ph})
     ORDER BY productId, sortOrder ASC, createdAt ASC`,
    productIds
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.productId)) map.set(r.productId, []);
    map.get(r.productId).push(r);
  }
  return map;
}

async function appendProductImagesFromDisk(productId, files) {
  if (!files || !files.length) return [];
  const basenames = files.map((f) => path.basename(f.filename));

  try {
    await withTransaction(async (conn) => {
      const [primaryRows] = await conn.execute(
        'SELECT COUNT(*) AS c FROM product_images WHERE productId = ? AND isPrimary = 1',
        [productId]
      );
      const hasPrimary = Number(primaryRows[0].c) > 0;
      const [maxRows] = await conn.execute(
        'SELECT COALESCE(MAX(sortOrder), -1) AS m FROM product_images WHERE productId = ?',
        [productId]
      );
      let sortNext = Number(maxRows[0].m) + 1;

      for (let i = 0; i < basenames.length; i++) {
        const imageUrl = toPublicUploadUrl(basenames[i]);
        const id = randomUUID();
        const isPrimary = !hasPrimary && i === 0 ? 1 : 0;
        await conn.execute(
          `INSERT INTO product_images (id, productId, imageUrl, sortOrder, isPrimary)
           VALUES (?, ?, ?, ?, ?)`,
          [id, productId, imageUrl, sortNext++, isPrimary]
        );
      }
    });
  } catch (err) {
    deleteFilesIfExist(basenames.map((b) => toPublicUploadUrl(b)));
    throw err;
  }

  const urlsSet = basenames.map((b) => toPublicUploadUrl(b));
  const ph = urlsSet.map(() => '?').join(',');
  const insertedRows = await query(
    `SELECT id, productId, imageUrl, sortOrder, isPrimary, createdAt, updatedAt
     FROM product_images
     WHERE productId = ? AND imageUrl IN (${ph})`,
    [productId, ...urlsSet]
  );

  const orderMap = new Map(urlsSet.map((u, idx) => [u, idx]));
  insertedRows.sort((a, b) => orderMap.get(a.imageUrl) - orderMap.get(b.imageUrl));
  return insertedRows.map(mapImageRowForApi);
}

async function deleteProductImagesByIds(storeId, productId, ids) {
  if (!ids.length) return;
  await assertProductInStore(storeId, productId);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT pi.id, pi.imageUrl
     FROM product_images pi
     INNER JOIN products p ON p.id = pi.productId
     WHERE pi.productId = ? AND p.storeId = ? AND pi.id IN (${placeholders})`,
    [productId, storeId, ...ids]
  );
  if (!rows.length) return;
  const idsToDelete = rows.map((r) => r.id);
  const php = idsToDelete.map(() => '?').join(',');
  await query(`DELETE FROM product_images WHERE productId = ? AND id IN (${php})`, [
    productId,
    ...idsToDelete,
  ]);

  rows.forEach((r) => deleteFileIfExists(r.imageUrl));

  await ensureExactlyOnePrimaryIfAny(productId);
}

async function ensureExactlyOnePrimaryIfAny(productId) {
  const countRows = await query(
    'SELECT COUNT(*) AS c FROM product_images WHERE productId = ? AND isPrimary = 1',
    [productId]
  );
  const c = Number(countRows[0].c);
  if (c === 0) {
    const first = await query(
      `SELECT id FROM product_images WHERE productId = ?
       ORDER BY sortOrder ASC, createdAt ASC LIMIT 1`,
      [productId]
  );
    if (first[0]) {
      await query('UPDATE product_images SET isPrimary = 0 WHERE productId = ?', [productId]);
      await query('UPDATE product_images SET isPrimary = 1 WHERE id = ?', [first[0].id]);
    }
  }
}

async function replaceAllProductImages(storeId, productId, files) {
  await assertProductInStore(storeId, productId);
  let oldUrls = [];
  const newBasenames = (files || []).map((f) => path.basename(f.filename));

  try {
    await withTransaction(async (conn) => {
      const [oldRows] = await conn.execute(
        'SELECT imageUrl FROM product_images WHERE productId = ?',
        [productId]
      );
      oldUrls = oldRows.map((r) => r.imageUrl);
      await conn.execute('DELETE FROM product_images WHERE productId = ?', [productId]);

      if (!newBasenames.length) return;

      for (let i = 0; i < newBasenames.length; i++) {
        const imageUrl = toPublicUploadUrl(newBasenames[i]);
        const id = randomUUID();
        const isPrimary = i === 0 ? 1 : 0;
        await conn.execute(
          `INSERT INTO product_images (id, productId, imageUrl, sortOrder, isPrimary)
           VALUES (?, ?, ?, ?, ?)`,
          [id, productId, imageUrl, i, isPrimary]
        );
      }
    });
  } catch (err) {
    deleteFilesIfExist(newBasenames.map((b) => toPublicUploadUrl(b)));
    throw err;
  }

  deleteFilesIfExist(oldUrls);

  const imgs = await fetchProductImages(productId);
  return imgs.map(mapImageRowForApi);
}

async function deleteAllPhysicalImages(storeId, productId) {
  await assertProductInStore(storeId, productId);
  const rows = await fetchProductImages(productId);
  rows.forEach((r) => deleteFileIfExists(r.imageUrl));
  await query('DELETE FROM product_images WHERE productId = ?', [productId]);
}

function mapDbImagesToGallery(piRows, legacyJsonFallback) {
  if (piRows?.length) return piRows.map(mapImageRowForApi);
  const legacy = safeLegacyUrls(legacyJsonFallback);
  return legacy.map((imageUrl, i) => ({
    id: null,
    imageUrl,
    isPrimary: i === 0,
    fullImageUrl: mapImageRowForApi({ imageUrl }).fullImageUrl,
  }));
}

function safeLegacyUrls(value) {
  if (!value) return [];
  try {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === 'string');
      } catch {
        return value.startsWith('http') ? [value] : [];
      }
      return [];
    }
    const arr = Array.isArray(value) ? value : [];
    return arr.filter((u) => typeof u === 'string');
  } catch {
    return [];
  }
}

module.exports = {
  assertProductInStore,
  fetchProductImages,
  fetchImagesGroupedByProductIds,
  appendProductImagesFromDisk,
  deleteProductImagesByIds,
  replaceAllProductImages,
  deleteAllPhysicalImages,
  ensureExactlyOnePrimaryIfAny,
  mapDbImagesToGallery,
};
