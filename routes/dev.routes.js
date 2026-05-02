const express = require('express');
const { runAdminSeed } = require('../scripts/seed-admin');

const router = express.Router();
const TEMP_SEED_KEY = 'ruvali_seed_2026';

// TEMPORARY ROUTE: Remove after production bootstrap is complete.
router.get('/seed-admin', async (req, res) => {
  const key = String(req.query.key || '');
  if (key !== TEMP_SEED_KEY) {
    return res.status(403).json({ status: 'forbidden' });
  }

  const result = await runAdminSeed();
  if (!result.ok) {
    return res.status(500).json({ status: 'seed failed' });
  }

  return res.json({ status: 'seed completed' });
});

module.exports = router;

