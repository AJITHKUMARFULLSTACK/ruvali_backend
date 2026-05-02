const { randomUUID } = require('crypto');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { deleteCategoryBannerIfExists } = require('../utils/fileUrl');

async function listCategoriesForStore(storeId) {
  return query(
    `SELECT * FROM categories WHERE storeId = ? ORDER BY sortOrder ASC, name ASC`,
    [storeId]
  );
}

async function getCategoryForStore(storeId, categoryId) {
  const rows = await query(
    'SELECT * FROM categories WHERE id = ? AND storeId = ? LIMIT 1',
    [categoryId, storeId]
  );
  return rows[0] || null;
}

async function createCategoryForStore(storeId, payload) {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (!name) {
    throw new HttpError(400, 'Category name is required');
  }
  const id = randomUUID();
  await query(
    `INSERT INTO categories (id, storeId, name, parentId) VALUES (?, ?, ?, ?)`,
    [id, storeId, name, payload.parentId || null]
  );
  const rows = await query('SELECT * FROM categories WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function updateCategoryForStore(storeId, categoryId, payload) {
  const existingRows = await query(
    'SELECT id FROM categories WHERE id = ? AND storeId = ? LIMIT 1',
    [categoryId, storeId]
  );
  const existing = existingRows[0];
  if (!existing) {
    console.warn('[CATEGORIES:update] Category not found', { categoryId, storeId });
    throw new HttpError(404, 'Category not found');
  }
  const data = {};
  if (payload.name != null) data.name = payload.name;
  if (payload.parentId !== undefined) data.parentId = payload.parentId || null;
  if (payload.bannerImage !== undefined) data.bannerImage = payload.bannerImage || null;
  if (payload.slug !== undefined) data.slug = payload.slug || null;
  if (payload.sortOrder !== undefined) data.sortOrder = payload.sortOrder;
  const keys = Object.keys(data);
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => data[k]);
    await query(
      `UPDATE categories SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, categoryId]
    );
  }
  const rows = await query('SELECT * FROM categories WHERE id = ? LIMIT 1', [categoryId]);
  return rows[0];
}

async function deleteCategoryForStore(storeId, categoryId) {
  const existingRows = await query(
    'SELECT id, bannerImage FROM categories WHERE id = ? AND storeId = ? LIMIT 1',
    [categoryId, storeId]
  );
  const existing = existingRows[0];
  if (!existing) throw new HttpError(404, 'Category not found');
  const bannerImage = existing.bannerImage || null;
  const productCountRows = await query(
    'SELECT COUNT(*) AS count FROM products WHERE categoryId = ?',
    [categoryId]
  );
  const hasProducts = Number(productCountRows[0].count) > 0;
  if (hasProducts) {
    throw new HttpError(400, 'Cannot delete: this category has products. Move or remove products first.');
  }
  const childCountRows = await query(
    'SELECT COUNT(*) AS count FROM categories WHERE parentId = ?',
    [categoryId]
  );
  const hasChildren = Number(childCountRows[0].count) > 0;
  if (hasChildren) {
    throw new HttpError(400, 'Cannot delete: this category has subcategories. Delete subcategories first.');
  }
  await query('DELETE FROM categories WHERE id = ?', [categoryId]);
  deleteCategoryBannerIfExists(bannerImage);
  return { deleted: true };
}

async function reorderCategoriesForStore(storeId, categoryIds) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return [];
  }
  await Promise.all(
    categoryIds.map((id, index) =>
      query('UPDATE categories SET sortOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND storeId = ?', [
        index,
        id,
        storeId,
      ])
    )
  );
  return listCategoriesForStore(storeId);
}

module.exports = {
  listCategoriesForStore,
  getCategoryForStore,
  createCategoryForStore,
  updateCategoryForStore,
  deleteCategoryForStore,
  reorderCategoriesForStore,
};
