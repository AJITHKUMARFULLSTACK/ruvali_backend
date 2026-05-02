const fs = require('fs');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  listCategoriesForStore,
  getCategoryForStore,
  createCategoryForStore,
  updateCategoryForStore,
  deleteCategoryForStore,
  reorderCategoriesForStore,
} = require('../services/category.service');
const { categoryBannerUpload } = require('../middlewares/categoryBannerMulter');
const {
  enrichCategoryForApi,
  toPublicCategoryBannerUrl,
  deleteCategoryBannerIfExists,
} = require('../utils/fileUrl');
const { HttpError } = require('../utils/httpError');

function unlinkQuiet(absPath) {
  if (!absPath || typeof absPath !== 'string') return;
  try {
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch {
    //
  }
}

function toSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

const listPublic = asyncHandler(async (req, res) => {
  const cats = await listCategoriesForStore(req.store.id);
  const withSlug = cats.map((c) =>
    enrichCategoryForApi({
      ...c,
      slug: c.slug || toSlug(c.name),
    })
  );

  console.log('[CATEGORIES:listPublic]', {
    storeId: req.store.id,
    storeSlug: req.store.slug,
    count: withSlug.length,
  });

  res.json(withSlug);
});

const listAdmin = asyncHandler(async (req, res) => {
  const cats = await listCategoriesForStore(req.adminUser.storeId);
  const out = cats.map((c) => enrichCategoryForApi(c));

  console.log('[CATEGORIES:listAdmin]', {
    storeId: req.adminUser.storeId,
    count: out.length,
  });

  res.json(out);
});

const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    throw new HttpError(400, 'Category name is required');
  }
  const cat = await createCategoryForStore(req.adminUser.storeId, body);

  console.log('[CATEGORIES:create]', {
    storeId: req.adminUser.storeId,
    categoryId: cat.id,
    name: cat.name,
  });

  res.status(201).json(enrichCategoryForApi(cat));
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const storeId = req.adminUser?.storeId;
  if (!storeId) throw new HttpError(401, 'Admin store not found');
  console.log('[CATEGORIES:update]', { categoryId: id, storeId, body: req.body });
  const cat = await updateCategoryForStore(storeId, id, req.body);
  res.json(enrichCategoryForApi(cat));
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
  res.json(cats.map((c) => enrichCategoryForApi(c)));
});

const updateBanner = [
  categoryBannerUpload,
  asyncHandler(async (req, res) => {
    const { id: categoryId } = req.params;
    if (!req.file) throw new HttpError(400, 'No banner image provided (field: banner)');
    const storeId = req.adminUser?.storeId;
    if (!storeId) throw new HttpError(401, 'Admin store not found');

    const diskPath = req.file.path;
    const bannerRelative = toPublicCategoryBannerUrl(req.file.filename);

    const existing = await getCategoryForStore(storeId, categoryId);
    if (!existing) {
      unlinkQuiet(diskPath);
      throw new HttpError(404, 'Category not found');
    }

    const previousBanner = existing.bannerImage || null;

    try {
      const updated = await updateCategoryForStore(storeId, categoryId, {
        bannerImage: bannerRelative,
      });

      if (previousBanner && previousBanner !== bannerRelative) {
        deleteCategoryBannerIfExists(previousBanner);
      }

      res.json(enrichCategoryForApi(updated));
    } catch (err) {
      unlinkQuiet(diskPath);
      throw err;
    }
  }),
];

module.exports = { listPublic, listAdmin, create, update, remove, reorder, updateBanner };
