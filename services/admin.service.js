const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');

async function loginAdmin({ email, password }) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
    include: { store: true }
  });

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
      id: admin.store.id,
      name: admin.store.name,
      slug: admin.store.slug
    }
  };
}

async function createInitialStoreAndAdmin({ store, admin }) {
  // Helper for first-time bootstrap (used by seed)
  const hashed = await bcrypt.hash(admin.password, 12);

  return prisma.store.create({
    data: {
      name: store.name,
      slug: store.slug,
      whatsappNumber: store.whatsappNumber,
      currency: store.currency || 'INR',
      themeMode: store.themeMode || 'DARK',
      primaryColor: store.primaryColor || '#ff0000',
      secondaryColor: store.secondaryColor || '#000000',
      logo: store.logo || null,
      backgroundImage: store.backgroundImage || null,
      admins: {
        create: {
          email: admin.email,
          password: hashed
        }
      }
    },
    include: { admins: true }
  });
}

module.exports = { loginAdmin, createInitialStoreAndAdmin };

