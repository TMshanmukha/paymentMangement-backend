import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt.js';
import { writeAudit } from '../utils/audit.js';

/** Verifies credentials, updates last_login_at, returns tokens + safe user object. */
export async function login({ username, password }, ip) {
  const [rows] = await pool.query(
    `SELECT id, username, password_hash, full_name, role, status, created_by
     FROM users WHERE username = ? OR email = ? LIMIT 1`,
    [username, username]
  );
  const user = rows[0];

  // Constant-ish behavior: don't reveal whether the username exists.
  if (!user) throw ApiError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('This account has been deactivated. Contact the admin.', 'ACCOUNT_INACTIVE');
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) throw ApiError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  const payload = { sub: user.id, role: user.role, username: user.username };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await writeAudit({
    userId: user.id,
    action: 'LOGIN',
    entity: 'user',
    entityId: user.id,
    description: `${user.full_name} logged in`,
    ip,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      createdBy: user.created_by,
    },
  };
}

export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw ApiError.unauthorized('No refresh token provided', 'NO_REFRESH_TOKEN');
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Session expired, please log in again', 'REFRESH_TOKEN_INVALID');
  }

  const [rows] = await pool.query('SELECT id, role, username, status FROM users WHERE id = ? LIMIT 1', [payload.sub]);
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.unauthorized('Account no longer active', 'ACCOUNT_INACTIVE');
  }

  const newPayload = { sub: user.id, role: user.role, username: user.username };
  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  };
}

export async function logout(userId, ip) {
  if (userId) {
    await writeAudit({ userId, action: 'LOGOUT', entity: 'user', entityId: userId, description: 'User logged out', ip });
  }
}

export async function getCurrentUser(userId) {
  const [rows] = await pool.query(
    'SELECT id, username, email, full_name, phone, role, status, created_by, last_login_at FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound('User not found');
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdBy: user.created_by,
    lastLoginAt: user.last_login_at,
  };
}
