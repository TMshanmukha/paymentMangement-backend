import rateLimit from 'express-rate-limit';

/** Throttles login attempts to slow down brute-force/credential-stuffing. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.', errorCode: 'RATE_LIMITED' },
});
