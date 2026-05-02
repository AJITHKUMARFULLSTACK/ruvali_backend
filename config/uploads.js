const fs = require('fs');
const {
  getProductUploadsDir,
  getCategoryUploadsDir,
} = require('../utils/fileUrl');

function ensureProductUploadsDir() {
  fs.mkdirSync(getProductUploadsDir(), { recursive: true });
}

function ensureCategoryUploadsDir() {
  fs.mkdirSync(getCategoryUploadsDir(), { recursive: true });
}

function ensureUploadDirs() {
  ensureProductUploadsDir();
  ensureCategoryUploadsDir();
}

module.exports = {
  ensureProductUploadsDir,
  ensureCategoryUploadsDir,
  ensureUploadDirs,
};
