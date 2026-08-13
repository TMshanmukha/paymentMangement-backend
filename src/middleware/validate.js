import { ApiError } from '../utils/ApiError.js';

/**
 * Validates req.body (or req.query) against a Zod schema.
 * On failure, throws a 400 ApiError with field-level details.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details));
    }
    req[source] = result.data;
    next();
  };
}
