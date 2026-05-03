const fs = require('fs');
const {
  getProductUploadsDir,
  getCategoryUploadsDir,
  getStoreAssetsDir,
} = require('../utils/fileUrl');

function ensureProductUploadsDir() {
  fs.mkdirSync(getProductUploadsDir(), { recursive: true });
}

function ensureCategoryUploadsDir() {
  fs.mkdirSync(getCategoryUploadsDir(), { recursive: true });
}

function ensureStoreAssetsDir() {
  fs.mkdirSync(getStoreAssetsDir(), { recursive: true });
}

function ensureUploadDirs() {
  ensureProductUploadsDir();
  ensureCategoryUploadsDir();
  ensureStoreAssetsDir();
}

module.exports = {
  ensureProductUploadsDir,
  ensureCategoryUploadsDir,
  ensureStoreAssetsDir,
  ensureUploadDirs,
};
