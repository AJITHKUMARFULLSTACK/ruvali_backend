const express = require('express');
const { listPublic, getAdmin, listAdmin, create, update, remove } = require('../controllers/product.controller');
const { requireStore } = require('../middlewares/requireStore');
const { authAdmin } = require('../middlewares/authAdmin');

const router = express.Router();

// Public: GET /api/products?storeSlug=slug  OR header x-store-slug
router.get('/', requireStore, listPublic);

// Admin: GET /api/products/admin
router.get('/admin', authAdmin, listAdmin);

// Admin: GET /api/products/:id
router.get('/:id', authAdmin, getAdmin);

// Admin CRUD
router.post('/', authAdmin, create);
router.put('/:id', authAdmin, update);
router.delete('/:id', authAdmin, remove);

module.exports = router;

