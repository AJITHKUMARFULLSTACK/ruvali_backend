const { asyncHandler } = require('../utils/asyncHandler');
const { loginAdmin } = require('../services/admin.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await loginAdmin({ email, password });
  res.json(result);
});

module.exports = { login };

