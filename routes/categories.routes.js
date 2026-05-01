const express = require('express');
const { listPublic, listAdmin, create, update, remove, reorder, updateBanner } = require('../controllers/category.controller');
const { requireStore } = require('../middlewares/requireStore');
const { authAdmin } = require('../middlewares/authAdmin');

const router = express.Router();

// Public: GET /api/categories?storeSlug=slug
router.get('/', requireStore, listPublic);

// Admin: GET /api/categories/admin (must be before /:id to avoid 'admin' matching as id)
router.get('/admin', authAdmin, listAdmin);

// Admin: POST /api/categories
router.post('/', authAdmin, create);

// Admin: PUT /api/categories/reorder
router.put('/reorder', authAdmin, reorder);

// Admin: PUT /api/categories/:id/banner (upload & save banner image)
router.put('/:id/banner', authAdmin, updateBanner);

// Admin: PUT /api/categories/:id
router.put('/:id', authAdmin, update);

// Admin: DELETE /api/categories/:id
router.delete('/:id', authAdmin, remove);

module.exports = router;

