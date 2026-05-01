const rateLimit = require('express-rate-limit');

const skipInDev = () => process.env.NODE_ENV === 'development';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev
});

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Too many orders from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev
});

const trackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: 'Too many tracking requests. Please try again in 5 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev
});

module.exports = { loginLimiter, orderLimiter, trackLimiter, generalLimiter };
