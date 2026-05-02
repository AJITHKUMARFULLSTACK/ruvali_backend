const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');

/**
 * Admin JWT auth.
 * Attaches: req.adminUser, req.store
 */
async function authAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Missing Authorization Bearer token');

    let decoded;
    try {
      decoded = jwt.verify(token, env.adminJwtSecret);
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const rows = await query(
      `SELECT 
        a.id, a.email, a.storeId,
        s.id AS store_id, s.name AS store_name, s.slug AS store_slug,
        s.logo, s.primaryColor, s.secondaryColor, s.backgroundImage,
        s.whatsappNumber, s.currency, s.themeMode
      FROM admin_users a
      JOIN stores s ON s.id = a.storeId
      WHERE a.id = ?
      LIMIT 1`,
      [decoded.adminUserId]
    );
    const adminUser = rows[0];

    if (!adminUser) throw new HttpError(401, 'Admin user not found');

    req.adminUser = { id: adminUser.id, email: adminUser.email, storeId: adminUser.storeId };
    req.store = {
      id: adminUser.store_id,
      name: adminUser.store_name,
      slug: adminUser.store_slug,
      logo: adminUser.logo,
      primaryColor: adminUser.primaryColor,
      secondaryColor: adminUser.secondaryColor,
      backgroundImage: adminUser.backgroundImage,
      whatsappNumber: adminUser.whatsappNumber,
      currency: adminUser.currency,
      themeMode: adminUser.themeMode,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authAdmin };

