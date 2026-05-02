const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { env } = require('./config/env');
const { initWhatsApp } = require('./services/whatsapp.service');
const { requestLogger } = require('./middlewares/requestLogger');
const { errorHandler } = require('./middlewares/errorHandler');
const { generalLimiter } = require('./middlewares/rateLimiter');
const { HttpError } = require('./utils/httpError');

const adminRoutes = require('./routes/admin.routes');
const storeRoutes = require('./routes/store.routes');
const productRoutes = require('./routes/products.routes');
const categoryRoutes = require('./routes/categories.routes');
const orderRoutes = require('./routes/orders.routes');
const uploadRoutes = require('./routes/uploads.routes');
const customerRoutes = require('./routes/customer.routes');
const systemRoutes = require('./routes/system.routes');
const devRoutes = require('./routes/dev.routes');

const app = express();

// Build allowed origins: from CORS_ORIGINS, always include localhost:3000 in development
const corsOrigins = [...env.corsOrigins];
if (env.nodeEnv === 'development' && !corsOrigins.includes('http://localhost:3000')) {
  corsOrigins.push('http://localhost:3000');
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin, Postman, curl)
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      callback(
        new HttpError(
          403,
          `CORS blocked: origin "${origin}" is not allowed. Configure CORS_ORIGINS to include your frontend URL.`
        )
      );
    },
    credentials: true,
  })
);
app.use(generalLimiter);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(requestLogger);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', systemRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes); // helper endpoint for admin panels
app.use('/api/customer', customerRoutes);
app.use('/api/dev', devRoutes); // TEMPORARY: remove after initial production seeding

app.use(errorHandler);

if (env.whatsapp.enabled) {
  initWhatsApp();
}

module.exports = { app };

