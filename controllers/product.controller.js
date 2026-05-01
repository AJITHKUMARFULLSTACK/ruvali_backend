const { asyncHandler } = require('../utils/asyncHandler');
const {
  getProductForStore,
  listProductsForStore,
  createProductForStore,
  updateProductForStore,
  deleteProductForStore
} = require('../services/product.service');

// Public: list by store slug (middleware requireStore sets req.store)
const listPublic = asyncHandler(async (req, res) => {
  const categoryId = req.query.categoryId || null;
  const hasPagination = req.query.page != null || req.query.limit != null;

  let result;
  if (hasPagination) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
    result = await listProductsForStore(req.store.id, { categoryId, page, limit });
  } else {
    result = await listProductsForStore(req.store.id, { categoryId, page: 1, limit: 9999 });
  }

  console.log('[PRODUCTS:listPublic]', {
    storeId: req.store.id,
    storeSlug: req.store.slug,
    query: req.query,
    categoryId,
    count: result.products.length,
    total: result.total
  });

  if (hasPagination) {
    res.json(result);
  } else {
    res.json(result.products);
  }
});

// Admin: get single product
const getAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await getProductForStore(req.adminUser.storeId, id);
  res.json(product);
});

// Admin: list by admin's store (unpaginated for admin panel)
const listAdmin = asyncHandler(async (req, res) => {
  const result = await listProductsForStore(req.adminUser.storeId, { limit: 9999 });
  const products = result.products;

  console.log('[PRODUCTS:listAdmin]', {
    storeId: req.adminUser.storeId,
    count: products.length
  });

  res.json(products);
});

const create = asyncHandler(async (req, res) => {
  const product = await createProductForStore(req.adminUser.storeId, req.body);

  console.log('[PRODUCTS:create]', {
    storeId: req.adminUser.storeId,
    productId: product.id,
    name: product.name
  });

  res.status(201).json(product);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await updateProductForStore(req.adminUser.storeId, id, req.body);
  res.json(product);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await deleteProductForStore(req.adminUser.storeId, id);
  res.status(204).send();
});

module.exports = { listPublic, getAdmin, listAdmin, create, update, remove };

