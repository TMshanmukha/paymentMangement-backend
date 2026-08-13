/**
 * Standard application error carrying an HTTP status and a stable errorCode
 * the frontend can branch on (see spec section 50 error format).
 */
export class ApiError extends Error {
  constructor(statusCode, message, errorCode = 'ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }

  static badRequest(message, errorCode = 'BAD_REQUEST', details) {
    return new ApiError(400, message, errorCode, details);
  }
  static unauthorized(message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
    return new ApiError(401, message, errorCode);
  }
  static forbidden(message = 'Forbidden', errorCode = 'FORBIDDEN') {
    return new ApiError(403, message, errorCode);
  }
  static notFound(message = 'Not found', errorCode = 'NOT_FOUND') {
    return new ApiError(404, message, errorCode);
  }
  static conflict(message, errorCode = 'CONFLICT') {
    return new ApiError(409, message, errorCode);
  }
  static internal(message = 'Internal server error', errorCode = 'INTERNAL_ERROR') {
    return new ApiError(500, message, errorCode);
  }
}
