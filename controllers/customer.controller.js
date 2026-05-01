const { asyncHandler } = require('../utils/asyncHandler');
const {
  registerCustomer,
  loginCustomer,
  getCustomerOrders
} = require('../services/customer.service');

const register = asyncHandler(async (req, res) => {
  const result = await registerCustomer(req.store, req.body);
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await loginCustomer(req.store, req.body);
  res.json(result);
});

const me = asyncHandler(async (req, res) => {
  res.json(req.customer);
});

const orders = asyncHandler(async (req, res) => {
  const ordersList = await getCustomerOrders(req.store, req.customer.id);
  res.json(ordersList);
});

module.exports = { register, login, me, orders };
