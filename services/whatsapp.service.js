const { Client, LocalAuth } = require('whatsapp-web.js');
const { env } = require('../config/env');

let client = null;
let isReady = false;
let isInitializing = false;
let lastQr = null;
let qrListeners = new Set();

async function initWhatsApp() {
  if (!env.whatsapp.enabled) return;
  if (isInitializing || isReady) return;

  // eslint-disable-next-line no-console
  console.log('[WhatsApp] Starting initialization...');

  isInitializing = true;
  lastQr = null;

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  client.on('qr', (qr) => {
    lastQr = qr;
    isReady = false;
    // eslint-disable-next-line no-console
    console.log('[WhatsApp] QR code generated, broadcasting to', qrListeners.size, 'listeners');
    qrListeners.forEach((res) => {
      res.write(`data: ${JSON.stringify({ type: 'qr', qr })}\n\n`);
    });
  });

  client.on('ready', () => {
    isReady = true;
    isInitializing = false;
    lastQr = null;
    // eslint-disable-next-line no-console
    console.log('[WhatsApp] Connected and ready');
    qrListeners.forEach((res) => {
      res.write(`data: ${JSON.stringify({ type: 'ready' })}\n\n`);
    });
    qrListeners.clear();
  });

  client.on('auth_failure', () => {
    isReady = false;
    isInitializing = false;
    lastQr = null;
    // eslint-disable-next-line no-console
    console.error('[WhatsApp] Auth failed');
  });

  client.on('disconnected', () => {
    isReady = false;
    isInitializing = false;
    lastQr = null;
    // eslint-disable-next-line no-console
    console.warn('[WhatsApp] Disconnected');
    setTimeout(() => initWhatsApp(), 10000);
  });

  try {
    await client.initialize();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[WhatsApp] Failed to initialize:', err.message);
    isInitializing = false;
  }
}

function addQrListener(res) {
  qrListeners.add(res);
  if (lastQr) {
    res.write(`data: ${JSON.stringify({ type: 'qr', qr: lastQr })}\n\n`);
  }
  if (isReady) {
    res.write(`data: ${JSON.stringify({ type: 'ready' })}\n\n`);
  }
  return () => qrListeners.delete(res);
}

async function sendWhatsAppMessage(phone, message) {
  if (!isReady) {
    // eslint-disable-next-line no-console
    console.log('[WhatsApp] not ready, skipping message');
    return;
  }
  try {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10 && !digits.startsWith('91')) {
      digits = '91' + digits;
    } else if (digits.startsWith('0')) {
      digits = '91' + digits.slice(1);
    }
    const chatId = digits + '@c.us';
    await client.sendMessage(chatId, message);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[WhatsApp] sendMessage error:', err.message);
  }
}

function isWhatsAppReady() {
  return isReady;
}

function getLastQr() {
  return lastQr;
}

module.exports = {
  initWhatsApp,
  addQrListener,
  sendWhatsAppMessage,
  isWhatsAppReady,
  getLastQr
};
