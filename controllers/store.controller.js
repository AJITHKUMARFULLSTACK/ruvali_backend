const { asyncHandler } = require('../utils/asyncHandler');
const { getStoreBySlug, updateStoreBranding } = require('../services/store.service');
const { prisma } = require('../config/prisma');

const getBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const store = await getStoreBySlug(slug);

  console.log('[STORE:getBySlug]', {
    slug,
    storeId: store.id
  });

  res.json(store);
});

// Admin-only: updates branding for current admin's store
const updateBranding = asyncHandler(async (req, res) => {
  const storeId = req.adminUser.storeId;
  const updated = await updateStoreBranding(storeId, req.body);

  console.log('[STORE:updateBranding]', {
    storeId,
    bodyKeys: Object.keys(req.body || {})
  });

  res.json(updated);
});

// Admin-only: touch store to bump updatedAt
const revalidate = asyncHandler(async (req, res) => {
  const storeId = req.adminUser.storeId;

  const updated = await prisma.store.update({
    where: { id: storeId },
    data: {
      // writing same name still bumps updatedAt
      name: req.store.name
    }
  });

  console.log('[STORE:revalidate]', {
    storeId,
    updatedAt: updated.updatedAt
  });

  res.json({ id: updated.id, updatedAt: updated.updatedAt });
});

module.exports = { getBySlug, updateBranding, revalidate };

