import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { pool } from '../db/pool.js';

/**
 * Verifies the Bearer access token, loads the current user's live status
 * from the DB (so a deactivated account is rejected immediately even if
 * their token hasn't expired yet), and attaches `req.user`.
 */
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Authentication required', 'NO_TOKEN');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Session expired, please log in again', 'TOKEN_INVALID');
    }

    const [rows] = await pool.query(
      'SELECT id, username, full_name, role, status, created_by FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user) throw ApiError.unauthorized('Account not found', 'USER_NOT_FOUND');
    if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is inactive', 'ACCOUNT_INACTIVE');

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      createdBy: user.created_by,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-gate middleware. Usage: authorize('ADMIN'), authorize('ADMIN','SCHOOL_ACCOUNTANT')
 * Backend is always the source of truth for permissions — frontend route
 * guards are UX only, never security.
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action', 'ROLE_NOT_ALLOWED'));
    }
    next();
  };
}

/** Maps a user's role to the student_type they're allowed to touch, or null for Admin (all). */
export function scopeForRole(role) {
  if (role === 'SCHOOL_ACCOUNTANT') return 'SCHOOL';
  if (role === 'TUITION_ACCOUNTANT') return 'TUITION';
  return null; // ADMIN - unrestricted
}
