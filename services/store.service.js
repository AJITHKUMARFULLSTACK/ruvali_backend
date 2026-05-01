const { prisma } = require('../config/prisma');
const { HttpError } = require('../utils/httpError');

async function getStoreBySlug(slug) {
  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store) throw new HttpError(404, 'Store not found');
  return store;
}

async function updateStoreBranding(storeId, payload) {
  const data = {
    name: payload.name,
    logo: payload.logo,
    primaryColor: payload.primaryColor,
    secondaryColor: payload.secondaryColor,
    backgroundImage: payload.backgroundImage,
    whatsappNumber: payload.whatsappNumber,
    currency: payload.currency,
    themeMode: payload.themeMode
  };

  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  return prisma.store.update({
    where: { id: storeId },
    data
  });
}

module.exports = { getStoreBySlug, updateStoreBranding };

