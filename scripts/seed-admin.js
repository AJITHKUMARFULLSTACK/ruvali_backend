/**
 * Resets or creates the default admin for a store (no duplicate rows).
 * Usage (on server, from ruvali-backend root, with .env loaded):
 *   npm run seed:admin
 *
 * Optional env overrides:
 *   SEED_ADMIN_EMAIL     (default: admin@ruvali.com)
 *   SEED_ADMIN_PASSWORD  (default: Admin@12345)
 *   SEED_STORE_SLUG      (default: ruvali)
 *
 * Never logs password or bcrypt hash — only DB name, slug, email, outcome.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { upsertSeedAdminCredentials } = require('../services/admin.service');

async function main() {
  const dbName = process.env.DB_NAME;
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  if (!host || !user || !dbName) {
    throw new Error('Missing DB config. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (e.g. in .env).');
  }

  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@ruvali.com').trim().toLowerCase();
  const plainPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const storeSlug = (process.env.SEED_STORE_SLUG || process.env.STORE_SLUG || 'ruvali').trim();

  // eslint-disable-next-line no-console
  console.log('[seed-admin] DB_NAME=%s store_slug=%s email=%s', dbName, storeSlug, email);

  const result = await upsertSeedAdminCredentials({
    email,
    plainPassword,
    storeSlug,
  });

  // eslint-disable-next-line no-console
  console.log(
    '[seed-admin] done action=%s admin_id_prefix=%s (password not logged)',
    result.action,
    String(result.adminId).slice(0, 8)
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed-admin] failed:', e.message);
  process.exit(1);
});
