const express = require('express');
const {
  listPublic,
  getAdmin,
  listAdmin,
  create,
  update,
  remove,
  uploadProductImagesHandler,
  patch,
  optionalMultipartForPatch,
  multipartCreateConditional,
  assignProductUuidForMultipart,
} = require('../controllers/product.controller');
const { requireStore } = require('../middlewares/requireStore');
const { authAdmin } = require('../middlewares/authAdmin');
const { requireAdminStoreSlug } = require('../middlewares/requireAdminStoreSlug');
const { uploadExistingProductImages } = require('../middlewares/productImagesMulter');

const router = express.Router();

// Public (store scope from header/query)
router.get('/', requireStore, listPublic);

// Admin listings / bulk before :id routes
router.get('/admin', authAdmin, requireAdminStoreSlug, listAdmin);

router.post(
  '/',
  authAdmin,
  requireAdminStoreSlug,
  assignProductUuidForMultipart,
  multipartCreateConditional,
  create
);

router.post(
  '/:id/images',
  authAdmin,
  requireAdminStoreSlug,
  uploadExistingProductImages,
  uploadProductImagesHandler
);

router.patch(
  '/:id',
  authAdmin,
  requireAdminStoreSlug,
  optionalMultipartForPatch,
  patch
);

router.put('/:id', authAdmin, requireAdminStoreSlug, update);
router.get('/:id', authAdmin, requireAdminStoreSlug, getAdmin);
router.delete('/:id', authAdmin, requireAdminStoreSlug, remove);

module.exports = router;
