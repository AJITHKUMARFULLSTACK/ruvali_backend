const { prisma } = require('../config/prisma');

async function getProductForStore(storeId, productId) {
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId },
    include: { category: true }
  });
  if (!product) {
    const { HttpError } = require('../utils/httpError');
    throw new HttpError(404, 'Product not found');
  }
  return product;
}

async function getDescendantCategoryIds(storeId, categoryId) {
  const all = await prisma.category.findMany({
    where: { storeId },
    select: { id: true, parentId: true }
  });
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
  const where = { storeId };

  if (categoryId) {
    const categoryIds = await getDescendantCategoryIds(storeId, categoryId);
    where.categoryId = { in: categoryIds };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.product.count({ where })
  ]);

  return {
    products,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

async function createProductForStore(storeId, payload) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: payload.categoryId,
      name: payload.name,
      description: payload.description || null,
      price: payload.price,
      images: payload.images || [],
      stock: payload.stock ?? 0
    }
  });
}

async function updateProductForStore(storeId, productId, payload) {
  // Ensure product belongs to this store
  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId }
  });
  if (!existing) {
    const { HttpError } = require('../utils/httpError');
    throw new HttpError(404, 'Product not found for this store');
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      categoryId: payload.categoryId,
      name: payload.name,
      description: payload.description,
      price: payload.price,
      images: payload.images,
      stock: payload.stock
    }
  });
}

async function deleteProductForStore(storeId, productId) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId }
  });
  if (!existing) {
    const { HttpError } = require('../utils/httpError');
    throw new HttpError(404, 'Product not found for this store');
  }

  await prisma.product.delete({
    where: { id: productId }
  });
}

module.exports = {
  getProductForStore,
  listProductsForStore,
  createProductForStore,
  updateProductForStore,
  deleteProductForStore
};

