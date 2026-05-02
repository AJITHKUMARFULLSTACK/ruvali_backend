const fs = require('fs');
const { randomUUID } = require('crypto');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const {
  fetchProductImages,
  fetchImagesGroupedByProductIds,
  appendProductImagesFromDisk,
  deleteProductImagesByIds,
  replaceAllProductImages,
  deleteAllPhysicalImages,
  mapDbImagesToGallery,
  assertProductInStore,
} = require('./productImage.service');

function unlinkMulterDiskFiles(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    try {
      if (f && f.path) fs.unlinkSync(f.path);
    } catch {
      //
    }
  }
}

function shapeProduct(row, piRows) {
  const category =
    row.category_id != null ? { id: row.category_id, name: row.category_name } : null;

  const legacyCol = safeParseJsonArray(row.images);
  const gallery = mapDbImagesToGallery(piRows && piRows.length ? piRows : null, legacyCol);

  const {
    category_id: _omitCatId,
    category_name: _omitCatName,
    images: _omitLegacyImages,
    ...rest
  } = row;
  return {
    ...rest,
    category,
    images: gallery,
  };
}

async function getProductForStore(storeId, productId) {
  const rows = await query(
    `SELECT p.*, c.id AS category_id, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.categoryId
     WHERE p.id = ? AND p.storeId = ?
     LIMIT 1`,
    [productId, storeId]
  );
  const product = rows[0];
  if (!product) throw new HttpError(404, 'Product not found');

  const piRows = await fetchProductImages(productId);
  return shapeProduct(product, piRows);
}

async function getDescendantCategoryIds(storeId, categoryId) {
  const all = await query(
    'SELECT id, parentId FROM categories WHERE storeId = ?',
    [storeId]
  );
  const ids = new Set([categoryId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return Array.from(ids);
}

async function listProductsForStore(storeId, { categoryId, page = 1, limit = 40 } = {}) {
  const params = [storeId];
  let whereSql = 'WHERE p.storeId = ?';

  if (categoryId) {
    const categoryIds = await getDescendantCategoryIds(storeId, categoryId);
    if (categoryIds.length > 0) {
      whereSql += ` AND p.categoryId IN (${categoryIds.map(() => '?').join(', ')})`;
      params.push(...categoryIds);
    }
  }

  const offset = (page - 1) * limit;
  const rows = await query(
    `SELECT p.*, c.id AS category_id, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.categoryId
     ${whereSql}
     ORDER BY p.createdAt DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const countRows = await query(
    `SELECT COUNT(*) AS count
     FROM products p
     ${whereSql}`,
    params
  );
  const total = Number(countRows[0].count || 0);

  const productIds = rows.map((r) => r.id);
  const imgsMap = await fetchImagesGroupedByProductIds(productIds);

  const products = rows.map((row) =>
    shapeProduct(row, imgsMap.get(row.id) || [])
  );

  return {
    products,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function createProductForStore(storeId, payload, opts = {}) {
  const id = opts.id || randomUUID();

  try {
    await query(
      `INSERT INTO products
      (id, storeId, categoryId, name, description, price, images, stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        payload.categoryId,
        payload.name,
        payload.description ?? null,
        Number(payload.price || 0),
        JSON.stringify(Array.isArray(payload.images) ? payload.images : []),
        Number(payload.stock ?? 0),
      ]
    );

    if (opts.uploadedFiles && opts.uploadedFiles.length) {
      await appendProductImagesFromDisk(id, opts.uploadedFiles);
    }

    return getProductForStore(storeId, id);
  } catch (err) {
    await query('DELETE FROM products WHERE id = ?', [id]).catch(() => {});
    unlinkMulterDiskFiles(opts.uploadedFiles);
    throw err;
  }
}

async function updateProductForStore(storeId, productId, payload) {
  const existingRows = await query(
    'SELECT id FROM products WHERE id = ? AND storeId = ? LIMIT 1',
    [productId, storeId]
  );
  if (!existingRows[0]) throw new HttpError(404, 'Product not found for this store');

  const data = {
    categoryId: payload.categoryId,
    name: payload.name,
    description: payload.description,
    price: payload.price !== undefined ? Number(payload.price) : undefined,
    stock: payload.stock !== undefined ? Number(payload.stock) : undefined,
    images:
      payload.images !== undefined ? JSON.stringify(payload.images) : undefined,
  };

  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  const keys = Object.keys(data);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => data[k]);
    await query(
      `UPDATE products SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, productId]
    );
  }

  return getProductForStore(storeId, productId);
}

async function patchProductForStore(storeId, productId, body, uploadedFiles = null) {
  const existingRows = await query(
    'SELECT id FROM products WHERE id = ? AND storeId = ? LIMIT 1',
    [productId, storeId]
  );
  if (!existingRows[0]) throw new HttpError(404, 'Product not found for this store');

  const replaceImages = truthy(body.replaceImages);
  const deleteIds = normalizeIdList(body.deleteImageIds);

  const hasUploads = uploadedFiles && uploadedFiles.length > 0;

  if (hasUploads && replaceImages) {
    await replaceAllProductImages(storeId, productId, uploadedFiles);
  } else if (replaceImages && !hasUploads) {
    await replaceAllProductImages(storeId, productId, []);
  } else {
    if (deleteIds.length) {
      await deleteProductImagesByIds(storeId, productId, deleteIds);
    }
    if (hasUploads) {
      await appendProductImagesFromDisk(productId, uploadedFiles);
    }
  }

  const scalar = {
    categoryId: body.categoryId,
    name: body.name,
    description: body.description,
    price:
      body.price !== undefined && body.price !== '' ? Number(body.price) : undefined,
    stock:
      body.stock !== undefined && body.stock !== '' ? Number(body.stock) : undefined,
  };

  Object.keys(scalar).forEach((k) => scalar[k] === undefined && delete scalar[k]);

  if (scalar.price !== undefined && Number.isNaN(scalar.price)) {
    throw new HttpError(400, 'Invalid price');
  }
  if (scalar.stock !== undefined && Number.isNaN(scalar.stock)) {
    throw new HttpError(400, 'Invalid stock');
  }

  const keys = Object.keys(scalar);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => scalar[k]);
    await query(
      `UPDATE products SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, productId]
    );
  }

  return getProductForStore(storeId, productId);
}

function normalizeIdList(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function truthy(v) {
  return v === true || v === 'true' || v === '1';
}

async function deleteProductForStore(storeId, productId) {
  const chk = await query('SELECT id FROM products WHERE id = ? AND storeId = ? LIMIT 1', [
    productId,
    storeId,
  ]);
  if (!chk[0]) throw new HttpError(404, 'Product not found for this store');

  await deleteAllPhysicalImages(storeId, productId);

  const hdr = await query('DELETE FROM products WHERE id = ? AND storeId = ?', [
    productId,
    storeId,
  ]);
  const n = typeof hdr.affectedRows === 'number' ? hdr.affectedRows : 0;
  if (n < 1) throw new HttpError(404, 'Product not found for this store');
}

async function addProductImagesForStore(storeId, productId, files) {
  await assertProductInStore(storeId, productId);
  return appendProductImagesFromDisk(productId, files);
}

function safeParseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  getProductForStore,
  listProductsForStore,
  createProductForStore,
  updateProductForStore,
  patchProductForStore,
  deleteProductForStore,
  addProductImagesForStore,
};
