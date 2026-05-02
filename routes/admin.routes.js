const express = require('express');
const { login, me } = require('../controllers/admin.controller');
const { authAdmin } = require('../middlewares/authAdmin');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { env } = require('../config/env');
const {
  initWhatsApp,
  addQrListener,
  isWhatsAppReady,
  getLastQr
} = require('../services/whatsapp.service');

const router = express.Router();

router.post('/login', loginLimiter, login); // POST /api/admin/login

router.get('/me', authAdmin, me);

router.get('/whatsapp/status', authAdmin, (req, res) => {
  const enabled = env.whatsapp.enabled;
  const ready = isWhatsAppReady();
  const hasQr = !!getLastQr();
  let message = 'WhatsApp is disabled.';
  if (enabled) {
    if (ready) message = 'WhatsApp is connected and ready.';
    else if (hasQr) message = 'Scan the QR code to connect.';
    else message = 'Connecting to WhatsApp...';
  }
  res.json({ enabled, ready, hasQr, message });
});

router.get('/whatsapp/qr-stream', authAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const cleanup = addQrListener(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });
});

router.post('/whatsapp/init', authAdmin, (req, res) => {
  initWhatsApp();
  res.json({ message: 'WhatsApp initialization started' });
});

module.exports = router;

