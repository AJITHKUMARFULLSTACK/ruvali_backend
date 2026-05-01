const { env } = require('../config/env');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const { method, originalUrl } = req;
  const storeSlugHeader = req.headers['x-store-slug'];
  const storeSlugQuery = req.query?.storeSlug;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const storeId =
      (req.store && req.store.id) ||
      (req.adminUser && req.adminUser.storeId) ||
      null;

    // Keep log compact but rich enough for debugging
    const logPayload = {
      method,
      url: originalUrl,
      status: res.statusCode,
      storeSlugHeader: storeSlugHeader || null,
      storeSlugQuery: storeSlugQuery || null,
      storeId,
      durationMs: Number(durationMs.toFixed(1))
    };

    // Only log bodies in development to avoid noisy prod logs
    if (env.nodeEnv === 'development' && req.body && Object.keys(req.body).length) {
      logPayload.body = req.body;
    }

    // eslint-disable-next-line no-console
    console.log('[REQ]', JSON.stringify(logPayload));
  });

  next();
}

module.exports = { requestLogger };

