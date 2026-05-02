const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');

/**
 * Public-store resolver.
 * Accepts store slug from:
 * - header: x-store-slug
 * - query:  storeSlug
 */
async function requireStore(req, res, next) {
  try {
    const slug = (req.headers['x-store-slug'] || req.query.storeSlug || '').toString().trim();
    if (!slug) throw new HttpError(400, 'Missing store slug. Provide header `x-store-slug` or query `storeSlug`.');

    const rows = await query('SELECT * FROM stores WHERE slug = ? LIMIT 1', [slug]);
    const store = rows[0];
    if (!store) throw new HttpError(404, 'Store not found');

    req.store = store;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireStore };

