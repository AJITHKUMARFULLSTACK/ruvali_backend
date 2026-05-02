const { HttpError } = require('../utils/httpError');

/**
 * Ensures header x-store-slug matches the JWT store (sets req.adminUser + req.store in authAdmin).
 */
function requireAdminStoreSlug(req, res, next) {
  const slug = (req.headers['x-store-slug'] || '').toString().trim();
  if (!slug) {
    next(new HttpError(400, 'Missing header x-store-slug'));
    return;
  }
  const authSlug = req.store?.slug;
  if (!authSlug || slug !== authSlug) {
    next(new HttpError(403, 'Store slug does not match authenticated admin store'));
    return;
  }
  next();
}

module.exports = { requireAdminStoreSlug };
