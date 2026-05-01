const multer = require('multer');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  listCategoriesForStore,
  createCategoryForStore,
  updateCategoryForStore,
  deleteCategoryForStore,
  reorderCategoriesForStore
} = require('../services/category.service');
const { uploadBufferToUrl } = require('./upload.controller');
const { HttpError } = require('../utils/httpError');

const upload = multer({ storage: multer.memoryStorage() });
const bannerUpload = upload.single('banner');

function toSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// Public: list by store slug (requireStore). Returns id, name, slug, bannerImage (+ parentId, children for tree)
const listPublic = asyncHandler(async (req, res) => {
  const cats = await listCategoriesForStore(req.store.id);
  const withSlug = cats.map((c) => ({
    ...c,
    slug: c.slug || toSlug(c.name)
  }));

  console.log('[CATEGORIES:listPublic]', {
    storeId: req.store.id,
    storeSlug: req.store.slug,
    count: withSlug.length
  });

  res.json(withSlug);
});

// Admin: list by admin's store
const listAdmin = asyncHandler(async (req, res) => {
  const cats = await listCategoriesForStore(req.adminUser.storeId);

  console.log('[CATEGORIES:listAdmin]', {
    storeId: req.adminUser.storeId,
    count: cats.length
  });

  res.json(cats);
});

const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    const { HttpError } = require('../utils/httpError');
    throw new HttpError(400, 'Category name is required');
  }
  const cat = await createCategoryForStore(req.adminUser.storeId, body);

  console.log('[CATEGORIES:create]', {
    storeId: req.adminUser.storeId,
    categoryId: cat.id,
    name: cat.name
  });

  res.status(201).json(cat);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const storeId = req.adminUser?.storeId;
  if (!storeId) {
    const { HttpError } = require('../utils/httpError');
    throw new HttpError(401, 'Admin store not found');
  }
  console.log('[CATEGORIES:update]', { categoryId: id, storeId, body: req.body });
  const cat = await updateCategoryForStore(storeId, id, req.body);
  res.json(cat);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await deleteCategoryForStore(req.adminUser.storeId, id);
  res.status(204).send();
});

const reorder = asyncHandler(async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order) || order.length === 0) {
    throw new HttpError(400, 'order must be a non-empty array of category IDs');
  }
  const cats = await reorderCategoriesForStore(req.adminUser.storeId, order);
  res.json(cats);
});

const updateBanner = [
  bannerUpload,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) throw new HttpError(400, 'No banner image provided (field: banner)');
    const storeId = req.adminUser?.storeId;
    if (!storeId) throw new HttpError(401, 'Admin store not found');
    const url = await uploadBufferToUrl({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      storeId
    });
    const cat = await updateCategoryForStore(storeId, id, { bannerImage: url });
    res.json(cat);
  })
];

module.exports = { listPublic, listAdmin, create, update, remove, reorder, updateBanner };

