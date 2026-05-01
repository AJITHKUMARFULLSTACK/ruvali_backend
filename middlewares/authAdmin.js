const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
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

    const adminUser = await prisma.adminUser.findUnique({
      where: { id: decoded.adminUserId },
      include: { store: true }
    });

    if (!adminUser) throw new HttpError(401, 'Admin user not found');

    req.adminUser = { id: adminUser.id, email: adminUser.email, storeId: adminUser.storeId };
    req.store = adminUser.store;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authAdmin };

