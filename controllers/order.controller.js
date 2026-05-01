const crypto = require('crypto');
const Razorpay = require('razorpay');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  createOrderForStore,
  listOrdersForStore,
  updateOrderStatusForStore,
  trackOrderForStore
} = require('../services/order.service');
const { HttpError } = require('../utils/httpError');
const { env } = require('../config/env');

// Public create order (requireStore sets req.store)
const create = asyncHandler(async (req, res) => {
  const order = await createOrderForStore(req.store, req.body);
  res.status(201).json(order);
});

// Public: create Razorpay order (returns orderId, amount, keyId for frontend checkout)
const createRazorpayOrder = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount) || 0;
  if (amount <= 0) throw new HttpError(400, 'Invalid amount');

  const keyId = env.razorpay.keyId;
  const keySecret = env.razorpay.keySecret;
  if (!keyId || !keySecret) throw new HttpError(503, 'Razorpay is not configured');

  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const amountInPaise = Math.round(amount * 100);
  const rzpOrder = await rzp.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `receipt_${Date.now()}`
  });

  res.json({
    orderId: rzpOrder.id,
    amount: rzpOrder.amount,
    currency: 'INR',
    keyId
  });
});

// Public: verify Razorpay payment and create DB order
const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    customer,
    items,
    shippingInfo,
    shippingAmount
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new HttpError(400, 'Missing Razorpay payment details');
  }
  if (!customer || !items?.length) {
    throw new HttpError(400, 'Missing customer or items');
  }

  const keySecret = env.razorpay.keySecret;
  if (!keySecret) throw new HttpError(503, 'Razorpay is not configured');

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    throw new HttpError(400, 'Payment verification failed');
  }

  const order = await createOrderForStore(req.store, {
    customer,
    items,
    shippingInfo: shippingInfo || null,
    shippingAmount: Number(shippingAmount) || 0,
    paymentId: razorpay_payment_id,
    paymentStatus: 'PAID'
  });

  res.status(201).json(order);
});

const VALID_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

// Admin: list orders for admin's store
const listAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const rawStatus = req.query.status;
  const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : undefined;

  const result = await listOrdersForStore(req.adminUser.storeId, { page, limit, status });
  res.json(result);
});

// Admin: update status (triggers WhatsApp)
const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  // eslint-disable-next-line no-console
  console.log('[ORDERS] updateStatus controller', {
    orderId: id,
    newStatus: status,
    adminStoreId: req.adminUser?.storeId
  });
  const order = await updateOrderStatusForStore(req.store || { id: req.adminUser.storeId }, id, status);
  res.json(order);
});

// Public: track order by orderId + phone (requireStore sets req.store)
const trackOrder = asyncHandler(async (req, res) => {
  const { orderId, phone } = req.query;
  if (!orderId || !phone || String(orderId).trim() === '' || String(phone).trim() === '') {
    throw new HttpError(400, 'Order ID and phone number are required');
  }
  const order = await trackOrderForStore(req.store, String(orderId).trim(), String(phone).trim());
  res.json(order);
});

module.exports = {
  create,
  createRazorpayOrder,
  verifyRazorpayPayment,
  listAdmin,
  updateStatus,
  trackOrder
};

