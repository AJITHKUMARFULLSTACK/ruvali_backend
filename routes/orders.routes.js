const express = require('express');
const {
  create,
  createRazorpayOrder,
  verifyRazorpayPayment,
  listAdmin,
  updateStatus,
  trackOrder
} = require('../controllers/order.controller');
const { requireStore } = require('../middlewares/requireStore');
const { authAdmin } = require('../middlewares/authAdmin');
const { orderLimiter, trackLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Public: POST /api/orders (create order for store)
router.post('/', orderLimiter, requireStore, create);

// Public: Razorpay create order (get order_id + amount for checkout)
router.post('/razorpay/create', orderLimiter, requireStore, createRazorpayOrder);

// Public: Razorpay verify payment (create DB order after successful payment)
router.post('/razorpay/verify', orderLimiter, requireStore, verifyRazorpayPayment);

// Public: GET /api/orders/track (order lookup by orderId + phone)
router.get('/track', trackLimiter, requireStore, trackOrder);

// Admin: GET /api/orders
router.get('/', authAdmin, listAdmin);

// Admin: PUT /api/orders/:id/status
router.put('/:id/status', authAdmin, updateStatus);

module.exports = router;

