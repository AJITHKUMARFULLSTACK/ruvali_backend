const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/db');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');

async function loginAdmin({ email, password }) {
  const normalized = String(email || '').trim().toLowerCase();
  const rows = await query(
    `SELECT 
      a.id, a.email, a.password, a.storeId,
      s.id AS store_id, s.name AS store_name, s.slug AS store_slug
     FROM admin_users a
     JOIN stores s ON s.id = a.storeId
     WHERE a.email = ?
     LIMIT 1`,
    [normalized]
  );
  const admin = rows[0];

  if (!admin) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, admin.password);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  const token = jwt.sign(
    { adminUserId: admin.id, storeId: admin.storeId },
    env.adminJwtSecret,
    { expiresIn: env.adminJwtExpiresIn }
  );

  return {
    token,
    admin: { id: admin.id, email: admin.email, storeId: admin.storeId },
    store: {
      id: admin.store_id,
      name: admin.store_name,
      slug: admin.store_slug
    }
  };
}

async function createInitialStoreAndAdmin({ store, admin }) {
  // Helper for first-time bootstrap (used by seed)
  const hashed = await bcrypt.hash(admin.password, 12);

  return withTransaction(async (conn) => {
    const storeId = randomUUID();
    const adminId = randomUUID();
    await conn.execute(
      `INSERT INTO stores (
        id, name, slug, whatsappNumber, currency, themeMode,
        primaryColor, secondaryColor, logo, backgroundImage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        store.name,
        store.slug,
        store.whatsappNumber,
        store.currency || 'INR',
        store.themeMode || 'DARK',
        store.primaryColor || '#ff0000',
        store.secondaryColor || '#000000',
        store.logo || null,
        store.backgroundImage || null,
      ]
    );

    await conn.execute(
      `INSERT INTO admin_users (id, email, password, storeId) VALUES (?, ?, ?, ?)`,
      [adminId, admin.email, hashed, storeId]
    );

    const [storeRows] = await conn.execute('SELECT * FROM stores WHERE id = ? LIMIT 1', [storeId]);
    const [adminRows] = await conn.execute(
      'SELECT id, email, storeId, createdAt, updatedAt FROM admin_users WHERE id = ? LIMIT 1',
      [adminId]
    );

    return {
      ...storeRows[0],
      admins: adminRows,
    };
  });
}

/**
 * Idempotent seed CLI: set or reset one admin's password (bcrypt 12 rounds).
 * Does not duplicate admin rows; logs must never print password or hash.
 *
 * @returns {{ action: 'updated' | 'created'; adminId: string; storeId: string }}
 */
async function upsertSeedAdminCredentials({ email, plainPassword, storeSlug }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('email is required');

  const hashed = await bcrypt.hash(plainPassword, 12);

  const storeRows = await query('SELECT id FROM stores WHERE slug = ? LIMIT 1', [
    String(storeSlug || 'ruvali').trim(),
  ]);
  if (!storeRows.length) {
    throw new Error(
      `No store found for slug "${storeSlug}". Insert a stores row first (e.g. slug=ruvali), then re-run this script.`
    );
  }

  const storeId = storeRows[0].id;
  const rows = await query('SELECT id FROM admin_users WHERE email = ? LIMIT 1', [normalizedEmail]);

  if (rows[0]) {
    await query('UPDATE admin_users SET password = ? WHERE id = ?', [hashed, rows[0].id]);
    return { action: 'updated', adminId: rows[0].id, storeId };
  }

  const adminId = randomUUID();
  await query('INSERT INTO admin_users (id, email, password, storeId) VALUES (?, ?, ?, ?)', [
    adminId,
    normalizedEmail,
    hashed,
    storeId,
  ]);
  return { action: 'created', adminId, storeId };
}

module.exports = { loginAdmin, createInitialStoreAndAdmin, upsertSeedAdminCredentials };

