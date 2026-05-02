const express = require('express');
const { testDbConnection } = require('../config/db');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ruvali-backend',
    timestamp: new Date().toISOString(),
  });
});

router.get('/test-db', async (req, res, next) => {
  try {
    const result = await testDbConnection();
    res.json({
      status: 'ok',
      database: result,
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: error.message || 'Database connection failed',
    });
  }
});

module.exports = router;

