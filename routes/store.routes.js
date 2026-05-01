const express = require('express');
const { getBySlug, updateBranding, revalidate } = require('../controllers/store.controller');
const { authAdmin } = require('../middlewares/authAdmin');

const router = express.Router();

// GET /api/store/:slug
router.get('/:slug', getBySlug);

// PUT /api/store (admin only, uses JWT + admin store)
router.put('/', authAdmin, updateBranding);

// POST /api/store/revalidate (admin only) – bump updatedAt for polling
router.post('/revalidate', authAdmin, revalidate);

module.exports = router;

