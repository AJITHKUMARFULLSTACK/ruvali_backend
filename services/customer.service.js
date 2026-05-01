const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
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

  const existingByEmail = await prisma.customer.findFirst({
    where: { storeId: store.id, email }
  });
  if (existingByEmail) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const existingByPhone = await prisma.customer.findFirst({
    where: { storeId: store.id, phone }
  });

  let customer;
  if (existingByPhone) {
    if (existingByPhone.password) {
      throw new HttpError(409, 'Account already exists');
    }
    customer = await prisma.customer.update({
      where: { id: existingByPhone.id },
      data: { email, password: hashedPassword }
    });
  } else {
    customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        name,
        email,
        phone,
        password: hashedPassword
      }
    });
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
  const customer = await prisma.customer.findFirst({
    where: { storeId: store.id, email }
  });
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
  const orders = await prisma.order.findMany({
    where: { customerId, storeId: store.id },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { product: { select: { name: true, price: true } } } },
      logs: { orderBy: { timestamp: 'asc' } }
    }
  });

  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    totalAmount: o.totalAmount,
    shippingAmount: o.shippingAmount ?? 0,
    createdAt: o.createdAt,
    paymentStatus: o.paymentStatus ?? 'PENDING',
    items: o.items.map((i) => ({
      productName: i.product?.name,
      quantity: i.quantity,
      price: i.price
    })),
    statusLog: o.logs.map((l) => ({
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
