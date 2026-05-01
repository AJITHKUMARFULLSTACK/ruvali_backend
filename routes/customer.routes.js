const express = require('express');
const { register, login, me, orders } = require('../controllers/customer.controller');
const { requireStore } = require('../middlewares/requireStore');
const { authCustomer } = require('../middlewares/authCustomer');
const { loginLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.use(requireStore);

router.post('/register', loginLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/me', authCustomer, me);
router.get('/orders', authCustomer, orders);

module.exports = router;
