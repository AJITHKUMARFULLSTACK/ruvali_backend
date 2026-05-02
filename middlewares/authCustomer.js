const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');

/**
 * Customer JWT auth.
 * Attaches: req.customer
 */
async function authCustomer(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.customerAuth.jwtSecret);
    } catch {
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }

    const rows = await query('SELECT * FROM customers WHERE id = ? LIMIT 1', [decoded.customerId]);
    const customer = rows[0];

    if (!customer || customer.storeId !== req.store?.id) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    req.customer = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authCustomer };
