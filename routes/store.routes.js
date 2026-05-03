const express = require('express');
const {
  getBySlug,
  updateBranding,
  revalidate,
  uploadBrandingAsset,
} = require('../controllers/store.controller');
const { authAdmin } = require('../middlewares/authAdmin');

const router = express.Router();

// Admin-only uploads must register before GET /:slug
router.post('/asset', authAdmin, ...uploadBrandingAsset);

router.post('/revalidate', authAdmin, revalidate);
router.put('/', authAdmin, updateBranding);
router.get('/:slug', getBySlug);

module.exports = router;

