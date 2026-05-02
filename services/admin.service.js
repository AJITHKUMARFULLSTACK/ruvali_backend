const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/db');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');

async function loginAdmin({ email, password }) {
  const rows = await query(
    `SELECT 
      a.id, a.email, a.password, a.storeId,
      s.id AS store_id, s.name AS store_name, s.slug AS store_slug
     FROM admin_users a
     JOIN stores s ON s.id = a.storeId
     WHERE a.email = ?
     LIMIT 1`,
    [email]
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

module.exports = { loginAdmin, createInitialStoreAndAdmin };

