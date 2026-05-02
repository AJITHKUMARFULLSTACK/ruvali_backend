const fs = require('fs');
const { getProductUploadsDir } = require('../utils/fileUrl');

function ensureProductUploadsDir() {
  const dir = getProductUploadsDir();
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = { ensureProductUploadsDir };
