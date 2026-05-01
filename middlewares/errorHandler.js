const { HttpError } = require('../utils/httpError');

function errorHandler(err, req, res, next) {
  // Prisma errors often have .code; keep response safe.
  const status = err instanceof HttpError ? err.status : 500;
  const isDev = process.env.NODE_ENV === 'development';
  const userMessage = status === 500 && !isDev ? 'Internal Server Error' : err.message;

  if (status === 500) {
    console.error('[ERROR]', err.message, err.code || '', err.meta || '');
  }

  const payload = {
    error: {
      message: userMessage
    }
  };

  if (err instanceof HttpError && err.details) {
    payload.error.details = err.details;
  }

  if (isDev) {
    payload.error.debug = {
      name: err.name,
      message: err.message,
      code: err.code,
      meta: err.meta,
      stack: err.stack
    };
  }

  res.status(status).json(payload);
}

module.exports = { errorHandler };

