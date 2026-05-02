const { randomUUID } = require('crypto');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');

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
  if (!product) {
    throw new HttpError(404, 'Product not found');
  }
  return {
    ...product,
    images: safeParseJsonArray(product.images),
    category: product.category_id
      ? { id: product.category_id, name: product.category_name }
      : null,
  };
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

  const products = rows.map((row) => ({
    ...row,
    images: safeParseJsonArray(row.images),
    category: row.category_id
      ? { id: row.category_id, name: row.category_name }
      : null,
  }));

  return {
    products,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

async function createProductForStore(storeId, payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO products
      (id, storeId, categoryId, name, description, price, images, stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      payload.categoryId,
      payload.name,
      payload.description || null,
      Number(payload.price || 0),
      JSON.stringify(payload.images || []),
      Number(payload.stock ?? 0),
    ]
  );
  const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
  return { ...rows[0], images: safeParseJsonArray(rows[0].images) };
}

async function updateProductForStore(storeId, productId, payload) {
  // Ensure product belongs to this store
  const existingRows = await query(
    'SELECT id FROM products WHERE id = ? AND storeId = ? LIMIT 1',
    [productId, storeId]
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new HttpError(404, 'Product not found for this store');
  }

  const data = {
    categoryId: payload.categoryId,
    name: payload.name,
    description: payload.description,
    price: payload.price,
    images: payload.images ? JSON.stringify(payload.images) : payload.images,
    stock: payload.stock,
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
  const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [productId]);
  return { ...rows[0], images: safeParseJsonArray(rows[0].images) };
}

async function deleteProductForStore(storeId, productId) {
  const existingRows = await query(
    'SELECT id FROM products WHERE id = ? AND storeId = ? LIMIT 1',
    [productId, storeId]
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new HttpError(404, 'Product not found for this store');
  }

  await query('DELETE FROM products WHERE id = ?', [productId]);
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
  deleteProductForStore
};

