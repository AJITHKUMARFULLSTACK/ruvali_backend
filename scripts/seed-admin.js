const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config();

const DEFAULTS = {
  storeName: process.env.SEED_STORE_NAME || 'Ruvali',
  storeSlug: process.env.SEED_STORE_SLUG || 'ruvali',
  storeWhatsapp: process.env.SEED_STORE_WHATSAPP || '+919840187165',
  storeCurrency: process.env.SEED_STORE_CURRENCY || 'INR',
  storeTheme: process.env.SEED_STORE_THEME || 'DARK',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@ruvali.com',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function run() {
  const dbConfig = {
    host: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    user: requireEnv('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: requireEnv('DB_NAME'),
  };

  const conn = await mysql.createConnection(dbConfig);

  try {
    await conn.beginTransaction();

    // 1) Ensure store exists
    const [storeRows] = await conn.execute(
      'SELECT * FROM stores WHERE slug = ? LIMIT 1',
      [DEFAULTS.storeSlug]
    );
    let store = storeRows[0];

    if (!store) {
      const storeId = randomUUID();
      await conn.execute(
        `INSERT INTO stores (
          id, name, slug, whatsappNumber, currency, themeMode, primaryColor, secondaryColor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          storeId,
          DEFAULTS.storeName,
          DEFAULTS.storeSlug,
          DEFAULTS.storeWhatsapp,
          DEFAULTS.storeCurrency,
          DEFAULTS.storeTheme,
          '#ff0000',
          '#000000',
        ]
      );
      const [createdStoreRows] = await conn.execute(
        'SELECT * FROM stores WHERE id = ? LIMIT 1',
        [storeId]
      );
      store = createdStoreRows[0];
      console.log(`[seed] Created store: ${store.slug}`);
    } else {
      console.log(`[seed] Store exists: ${store.slug}`);
    }

    // 2) Ensure settings row exists (schema has unique storeId)
    const [settingsRows] = await conn.execute(
      'SELECT id FROM settings WHERE storeId = ? LIMIT 1',
      [store.id]
    );
    if (!settingsRows[0]) {
      await conn.execute(
        `INSERT INTO settings (id, storeId, keyName, valueJson)
         VALUES (?, ?, ?, ?)`,
        [
          randomUUID(),
          store.id,
          'store_config',
          JSON.stringify({
            onboarding: true,
            seededAt: new Date().toISOString(),
          }),
        ]
      );
      console.log('[seed] Created settings row');
    } else {
      console.log('[seed] Settings row exists');
    }

    // 3) Ensure admin exists with bcrypt password
    const [adminRows] = await conn.execute(
      'SELECT id, email, storeId FROM admin_users WHERE email = ? LIMIT 1',
      [DEFAULTS.adminEmail]
    );
    const existingAdmin = adminRows[0];
    const hashed = await bcrypt.hash(DEFAULTS.adminPassword, 12);

    if (!existingAdmin) {
      await conn.execute(
        `INSERT INTO admin_users (id, email, password, storeId)
         VALUES (?, ?, ?, ?)`,
        [randomUUID(), DEFAULTS.adminEmail, hashed, store.id]
      );
      console.log(`[seed] Created admin user: ${DEFAULTS.adminEmail}`);
    } else {
      await conn.execute(
        'UPDATE admin_users SET password = ?, storeId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [hashed, store.id, existingAdmin.id]
      );
      console.log(`[seed] Updated existing admin password/store: ${DEFAULTS.adminEmail}`);
    }

    // 4) Optional seed categories
    const categorySeeds = [
      { name: 'Men', slug: 'men', sortOrder: 0 },
      { name: 'Women', slug: 'women', sortOrder: 1 },
      { name: 'Kids', slug: 'kids', sortOrder: 2 },
    ];

    for (const cat of categorySeeds) {
      const [catRows] = await conn.execute(
        'SELECT id FROM categories WHERE storeId = ? AND slug = ? LIMIT 1',
        [store.id, cat.slug]
      );
      if (!catRows[0]) {
        await conn.execute(
          `INSERT INTO categories (id, storeId, name, slug, sortOrder)
           VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), store.id, cat.name, cat.slug, cat.sortOrder]
        );
        console.log(`[seed] Added category: ${cat.name}`);
      }
    }

    // 5) Optional sample product
    const [menRows] = await conn.execute(
      'SELECT id FROM categories WHERE storeId = ? AND slug = ? LIMIT 1',
      [store.id, 'men']
    );
    const menCategory = menRows[0];
    if (menCategory) {
      const sampleName = 'Classic White Tee';
      const [productRows] = await conn.execute(
        'SELECT id FROM products WHERE storeId = ? AND name = ? LIMIT 1',
        [store.id, sampleName]
      );
      if (!productRows[0]) {
        await conn.execute(
          `INSERT INTO products
            (id, storeId, categoryId, name, description, price, images, stock)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            store.id,
            menCategory.id,
            sampleName,
            'Seed product for initial catalog verification',
            999.0,
            JSON.stringify([]),
            50,
          ]
        );
        console.log(`[seed] Added sample product: ${sampleName}`);
      }
    }

    await conn.commit();
    console.log('[seed] Completed successfully');
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error('[seed] Failed:', error.message);
  process.exitCode = 1;
});

