import { ApiError } from '../utils/ApiError.js';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', errorCode: 'ROUTE_NOT_FOUND' });
}

/**
 * Centralized error handler. Never leaks raw SQL errors, stack traces,
 * or DB credentials to the client (spec section 50/40).
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode,
      details: err.details,
    });
  }

  // MySQL duplicate key etc.
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
      errorCode: 'DUPLICATE_ENTRY',
    });
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    errorCode: 'INTERNAL_ERROR',
  });
}
