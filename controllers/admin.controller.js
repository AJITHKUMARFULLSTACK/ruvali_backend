const { asyncHandler } = require('../utils/asyncHandler');
const { loginAdmin } = require('../services/admin.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await loginAdmin({ email, password });
  res.json(result);
});

/** Current admin (JWT verified by authAdmin middleware). */
const me = asyncHandler(async (req, res) => {
  const { id, email, storeId } = req.adminUser;
  res.json({
    admin: {
      id,
      email,
      storeId,
    },
  });
});

module.exports = { login, me };

