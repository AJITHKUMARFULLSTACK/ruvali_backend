const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const fs = require('fs');
const {
  getProductForStore,
  listProductsForStore,
  createProductForStore,
  updateProductForStore,
  patchProductForStore,
  deleteProductForStore,
  addProductImagesForStore,
} = require('../services/product.service');

function cleanupUploadedFiles(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    try {
      if (f.path) fs.unlinkSync(f.path);
    } catch {
      //
    }
  }
}

const listPublic = asyncHandler(async (req, res) => {
  const categoryId = req.query.categoryId || null;
  const hasPagination = req.query.page != null || req.query.limit != null;

  let result;
  if (hasPagination) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
    result = await listProductsForStore(req.store.id, { categoryId, page, limit });
  } else {
    result = await listProductsForStore(req.store.id, {
      categoryId,
      page: 1,
      limit: 9999,
    });
  }

  if (hasPagination) res.json(result);
  else res.json(result.products);
});

const getAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await getProductForStore(req.adminUser.storeId, id);
  res.json(product);
});

const listAdmin = asyncHandler(async (req, res) => {
  const result = await listProductsForStore(req.adminUser.storeId, { limit: 9999 });
  res.json(result.products);
});

function buildJsonCreatePayload(body) {
  return {
    name: body.name,
    description:
      body.description === undefined ? null : body.description === '' ? null : body.description,
    price: Number(body.price ?? 0),
    stock: Number(body.stock ?? 0),
    categoryId: body.categoryId,
    images: Array.isArray(body.images) ? body.images : undefined,
  };
}

const create = asyncHandler(async (req, res) => {
  const isMultipart = (req.headers['content-type'] || '').includes(
    'multipart/form-data'
  );

  if (isMultipart) {
    const opts = {
      id: req.preAssignedProductId,
      uploadedFiles: req.files?.length ? req.files : null,
    };
    const payload = {
      name: (req.body.name ?? '').toString().trim(),
      categoryId: (req.body.categoryId ?? '').toString().trim(),
      description:
        req.body.description === undefined || req.body.description === ''
          ? null
          : `${req.body.description}`,
      price: Number(req.body.price ?? 0),
      stock: Number(req.body.stock ?? 0),
    };

    if (!payload.name || !payload.categoryId) {
      cleanupUploadedFiles(req.files);
      throw new HttpError(400, 'Missing required fields: name and categoryId');
    }

    if (Number.isNaN(payload.price)) throw new HttpError(400, 'Invalid price');
    if (Number.isNaN(payload.stock)) throw new HttpError(400, 'Invalid stock');

    const product = await createProductForStore(req.adminUser.storeId, payload, opts);
    return res.status(201).json(product);
  }

  const payload = buildJsonCreatePayload(req.body);
  if (!payload.name || !payload.categoryId) {
    throw new HttpError(400, 'Missing required fields: name and categoryId');
  }
  if (Number.isNaN(payload.price)) payload.price = 0;
  if (Number.isNaN(payload.stock)) payload.stock = 0;

  const product = await createProductForStore(req.adminUser.storeId, payload);
  res.status(201).json(product);
});

const uploadProductImagesHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.files || !req.files.length)
    throw new HttpError(400, 'No images uploaded. Use multipart field `images` or `images[]`.');
  const records = await addProductImagesForStore(req.adminUser.storeId, id, req.files);
  res.status(201).json({ images: records });
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await updateProductForStore(req.adminUser.storeId, id, req.body);
  res.json(product);
});

function optionalMultipartForPatch(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) return next();
  const { uploadExistingProductImages } = require('../middlewares/productImagesMulter');
  return uploadExistingProductImages(req, res, next);
}

function multipartCreateConditional(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) return next();
  const { uploadCreateProductImages } = require('../middlewares/productImagesMulter');
  return uploadCreateProductImages(req, res, next);
}

function assignProductUuidForMultipart(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) return next();
  const { assignProductIdBeforeMultipartUpload } = require('../middlewares/productImagesMulter');
  return assignProductIdBeforeMultipartUpload(req, res, next);
}

const patch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await patchProductForStore(
    req.adminUser.storeId,
    id,
    req.body,
    req.files && req.files.length ? req.files : null
  );
  res.json(product);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await deleteProductForStore(req.adminUser.storeId, id);
  res.status(204).send();
});

module.exports = {
  listPublic,
  getAdmin,
  listAdmin,
  create,
  update,
  uploadProductImagesHandler,
  patch,
  remove,
  optionalMultipartForPatch,
  multipartCreateConditional,
  assignProductUuidForMultipart,
};
