const dotenv = require('dotenv');

dotenv.config();

function mustGet(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// --- DATABASE_URL: required in all environments ---
const databaseUrl = process.env.DATABASE_URL || null;
if (!databaseUrl || !databaseUrl.trim()) {
  throw new Error(
    'FATAL: DATABASE_URL is not set. The server cannot start without a database.'
  );
}

// --- ADMIN_JWT_SECRET: strict in production, warn in development ---
const nodeEnv = process.env.NODE_ENV || 'development';
const rawAdminJwtSecret = process.env.ADMIN_JWT_SECRET;
const isProduction = nodeEnv === 'production';

let adminJwtSecret;
if (isProduction) {
  if (!rawAdminJwtSecret || rawAdminJwtSecret.trim() === '' || rawAdminJwtSecret === 'change-me') {
    throw new Error(
      'FATAL: ADMIN_JWT_SECRET is not set or is using the default value. Set a strong secret in your environment.'
    );
  }
  adminJwtSecret = rawAdminJwtSecret;
} else {
  adminJwtSecret = rawAdminJwtSecret || 'change-me';
  if (!rawAdminJwtSecret || rawAdminJwtSecret === 'change-me') {
    // eslint-disable-next-line no-console
    console.warn(
      '[SECURITY] ADMIN_JWT_SECRET is not set or is using the default value. Set a strong secret for production.'
    );
  }
}

const env = {
  nodeEnv,
  port: parseInt(process.env.PORT || '5005', 10),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  databaseUrl,

  adminJwtSecret,
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '7d',

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || ''
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
  },

  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === 'true'
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || ''
  },

  customerAuth: {
    jwtSecret: process.env.CUSTOMER_JWT_SECRET || 'customer-change-me',
    jwtExpiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || '30d'
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    fromName: process.env.EMAIL_FROM_NAME || 'Ruvali Store',
    adminEmail: process.env.ADMIN_NOTIFICATION_EMAIL || ''
  }
};

// --- EMAIL: warn if not configured ---
if (!env.email.user?.trim() || !env.email.pass?.trim()) {
  // eslint-disable-next-line no-console
  console.warn('[Email] WARNING: Email not configured. Order emails will be skipped.');
}

// --- CUSTOMER_JWT_SECRET: warn in production if missing or default ---
const rawCustomerJwtSecret = process.env.CUSTOMER_JWT_SECRET;
if (isProduction && (!rawCustomerJwtSecret || rawCustomerJwtSecret.trim() === '' || rawCustomerJwtSecret === 'customer-change-me')) {
  // eslint-disable-next-line no-console
  console.warn(
    '[SECURITY] CUSTOMER_JWT_SECRET is not set or is using the default value. Set a strong secret for production.'
  );
}

module.exports = { env, mustGet };

