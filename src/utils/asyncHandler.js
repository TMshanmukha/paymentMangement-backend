/**
 * Wraps an async route handler so thrown errors / rejected promises
 * are forwarded to Express's centralized error handler instead of
 * crashing the process or requiring try/catch in every controller.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
