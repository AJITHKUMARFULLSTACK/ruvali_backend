const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { query } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { env } = require('../config/env');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function registerCustomer(store, { name, email, phone, password }) {
  if (!name || !email || !phone || !password) {
    throw new HttpError(400, 'Name, email, phone and password are required');
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'Invalid email format');
  }
  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }

  const existingByEmailRows = await query(
    'SELECT id FROM customers WHERE storeId = ? AND email = ? LIMIT 1',
    [store.id, email]
  );
  const existingByEmail = existingByEmailRows[0];
  if (existingByEmail) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const existingByPhoneRows = await query(
    'SELECT * FROM customers WHERE storeId = ? AND phone = ? LIMIT 1',
    [store.id, phone]
  );
  const existingByPhone = existingByPhoneRows[0];

  let customer;
  if (existingByPhone) {
    if (existingByPhone.password) {
      throw new HttpError(409, 'Account already exists');
    }
    await query('UPDATE customers SET email = ?, password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [
      email,
      hashedPassword,
      existingByPhone.id,
    ]);
    const updatedRows = await query('SELECT * FROM customers WHERE id = ? LIMIT 1', [existingByPhone.id]);
    customer = updatedRows[0];
  } else {
    const id = randomUUID();
    await query(
      `INSERT INTO customers (id, storeId, name, email, phone, password) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, store.id, name, email, phone, hashedPassword]
    );
    const createdRows = await query('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
    customer = createdRows[0];
  }

  const token = jwt.sign(
    { customerId: customer.id, storeId: store.id },
    env.customerAuth.jwtSecret,
    { expiresIn: env.customerAuth.jwtExpiresIn }
  );

  return {
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    }
  };
}

async function loginCustomer(store, { email, password }) {
  const rows = await query(
    'SELECT * FROM customers WHERE storeId = ? AND email = ? LIMIT 1',
    [store.id, email]
  );
  const customer = rows[0];
  if (!customer) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!customer.password) {
    throw new HttpError(401, 'Please register to set a password');
  }
  const valid = await bcrypt.compare(password, customer.password);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const token = jwt.sign(
    { customerId: customer.id, storeId: store.id },
    env.customerAuth.jwtSecret,
    { expiresIn: env.customerAuth.jwtExpiresIn }
  );

  return {
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    }
  };
}

async function getCustomerOrders(store, customerId) {
  const orders = await query(
    `SELECT * FROM orders WHERE customerId = ? AND storeId = ? ORDER BY createdAt DESC`,
    [customerId, store.id]
  );
  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const items = await query(
    `SELECT oi.orderId, oi.quantity, oi.price, p.name AS product_name
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.productId
     WHERE oi.orderId IN (${orderIds.map(() => '?').join(', ')})`,
    orderIds
  );
  const logs = await query(
    `SELECT orderId, timestamp, newStatus FROM order_logs
     WHERE orderId IN (${orderIds.map(() => '?').join(', ')})
     ORDER BY timestamp ASC`,
    orderIds
  );

  const itemsMap = new Map();
  const logsMap = new Map();
  for (const i of items) {
    if (!itemsMap.has(i.orderId)) itemsMap.set(i.orderId, []);
    itemsMap.get(i.orderId).push(i);
  }
  for (const l of logs) {
    if (!logsMap.has(l.orderId)) logsMap.set(l.orderId, []);
    logsMap.get(l.orderId).push(l);
  }

  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    totalAmount: o.totalAmount,
    shippingAmount: o.shippingAmount ?? 0,
    createdAt: o.createdAt,
    paymentStatus: o.paymentStatus ?? 'PENDING',
    items: (itemsMap.get(o.id) || []).map((i) => ({
      productName: i.product_name,
      quantity: i.quantity,
      price: i.price
    })),
    statusLog: (logsMap.get(o.id) || []).map((l) => ({
      timestamp: l.timestamp,
      newStatus: l.newStatus
    }))
  }));
}

module.exports = {
  registerCustomer,
  loginCustomer,
  getCustomerOrders
};
