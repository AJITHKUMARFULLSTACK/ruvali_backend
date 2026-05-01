const { prisma } = require('../config/prisma');
const { HttpError } = require('../utils/httpError');

async function listCategoriesForStore(storeId) {
  return prisma.category.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  });
}

async function createCategoryForStore(storeId, payload) {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (!name) {
    throw new HttpError(400, 'Category name is required');
  }
  return prisma.category.create({
    data: {
      storeId,
      name,
      parentId: payload.parentId || null
    }
  });
}

async function updateCategoryForStore(storeId, categoryId, payload) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, storeId }
  });
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
  return prisma.category.update({
    where: { id: categoryId },
    data
  });
}

async function deleteCategoryForStore(storeId, categoryId) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, storeId }
  });
  if (!existing) throw new HttpError(404, 'Category not found');
  const hasProducts = await prisma.product.count({ where: { categoryId } }) > 0;
  if (hasProducts) {
    throw new HttpError(400, 'Cannot delete: this category has products. Move or remove products first.');
  }
  const hasChildren = await prisma.category.count({ where: { parentId: categoryId } }) > 0;
  if (hasChildren) {
    throw new HttpError(400, 'Cannot delete: this category has subcategories. Delete subcategories first.');
  }
  await prisma.category.delete({ where: { id: categoryId } });
  return { deleted: true };
}

async function reorderCategoriesForStore(storeId, categoryIds) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return [];
  }
  await Promise.all(
    categoryIds.map((id, index) =>
      prisma.category.updateMany({
        where: { id, storeId },
        data: { sortOrder: index }
      })
    )
  );
  return listCategoriesForStore(storeId);
}

module.exports = {
  listCategoriesForStore,
  createCategoryForStore,
  updateCategoryForStore,
  deleteCategoryForStore,
  reorderCategoriesForStore
};

