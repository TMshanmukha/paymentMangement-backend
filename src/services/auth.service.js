import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt.js';
import { writeAudit } from '../utils/audit.js';
import { sendPasswordResetLinkEmail, sendPasswordResetOtpEmail } from './email.service.js';
import { env } from '../config/env.js';

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

export async function requestAdminPasswordReset(usernameOrEmail, requestOrigin) {
  // Fetch configured admin reset email and school name from app_settings
  const [settingRows] = await pool.query(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('admin_reset_email', 'institution_name')"
  );
  const settingsMap = settingRows.reduce((acc, r) => ({ ...acc, [r.setting_key]: r.setting_value }), {});
  const configuredResetEmail = settingsMap.admin_reset_email?.trim() || '';
  const schoolName = settingsMap.institution_name?.trim() || 'VEDAVYAS E.M SCHOOL';

  let user;
  if (usernameOrEmail && String(usernameOrEmail).trim()) {
    const term = String(usernameOrEmail).trim();
    const [rows] = await pool.query(
      `SELECT id, username, email, full_name, role, status
       FROM users WHERE (username = ? OR email = ?) AND role = 'ADMIN' LIMIT 1`,
      [term, term]
    );
    user = rows[0];

    // If user typed the configured reset email from settings, resolve to the primary active admin
    if (!user && configuredResetEmail && term.toLowerCase() === configuredResetEmail.toLowerCase()) {
      const [adminRows] = await pool.query(
        `SELECT id, username, email, full_name, role, status
         FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1`
      );
      user = adminRows[0];
    }
  } else {
    const [rows] = await pool.query(
      `SELECT id, username, email, full_name, role, status
       FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1`
    );
    user = rows[0];
  }

  if (!user) {
    throw ApiError.notFound('Admin account not found. Please provide a valid admin username or email.', 'ADMIN_NOT_FOUND');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('This admin account is inactive.', 'ACCOUNT_INACTIVE');
  }

  const targetEmail = configuredResetEmail || user.email || env.ADMIN_RESET_EMAIL || 'shanmu547@gmail.com';

  // Invalidate any existing unused reset tokens for this user
  await pool.query('UPDATE password_resets SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE', [user.id]);

  // Generate secure random reset token and numeric OTP
  const token = crypto.randomBytes(32).toString('hex');
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const minutesValid = 15;
  const expiresAt = new Date(Date.now() + minutesValid * 60 * 1000);

  // Store reset token record
  await pool.query(
    `INSERT INTO password_resets (user_id, email, otp, token, expires_at, is_used)
     VALUES (?, ?, ?, ?, ?, FALSE)`,
    [user.id, targetEmail, otp, token, expiresAt]
  );

  // Construct reset link URL cleanly with a single valid origin (never comma-separated)
  let clientBase;
  if (requestOrigin && !requestOrigin.includes(',')) {
    clientBase = requestOrigin.replace(/\/$/, '');
  } else {
    const rawOrigins = (process.env.CLIENT_URL || env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    clientBase = (process.env.NODE_ENV === 'production'
      ? (rawOrigins.find((o) => o.startsWith('https://')) || rawOrigins[0])
      : (rawOrigins.find((o) => o.includes('localhost')) || rawOrigins[0])
    ).replace(/\/$/, '');
  }

  const resetUrl = `${clientBase}/reset-password?token=${token}`;

  // Dispatch email with reset link
  await sendPasswordResetLinkEmail({
    email: targetEmail,
    resetUrl,
    minutesValid,
    schoolName,
  });

  await writeAudit({
    userId: user.id,
    action: 'FORGOT_PASSWORD_REQUEST',
    entity: 'user',
    entityId: user.id,
    description: `Admin password reset link sent to ${targetEmail}`,
  });

  // Mask email for user display: e.g. s***u@gmail.com
  const parts = targetEmail.split('@');
  const namePart = parts[0];
  const maskedName = namePart.length > 2 
    ? namePart[0] + '*'.repeat(namePart.length - 2) + namePart[namePart.length - 1]
    : namePart[0] + '*';
  const maskedEmail = `${maskedName}@${parts[1]}`;

  return {
    success: true,
    message: 'Password reset link has been sent to your registered email',
    email: maskedEmail,
    expiresInSeconds: minutesValid * 60,
    resetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
  };
}

export async function verifyAndResetPassword({ token, usernameOrEmail, otp, newPassword }) {
  if (!newPassword || newPassword.length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters long', 'INVALID_PASSWORD_LENGTH');
  }

  let resetRecord;
  let user;

  // Case 1: Verified via secure link token
  if (token && String(token).trim()) {
    const cleanToken = String(token).trim();
    const [resetRows] = await pool.query(
      `SELECT id, user_id, email, token, expires_at, is_used
       FROM password_resets
       WHERE token = ? AND is_used = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [cleanToken]
    );
    resetRecord = resetRows[0];

    if (!resetRecord) {
      throw ApiError.badRequest('Invalid or expired password reset link. Please request a new link from the login page.', 'TOKEN_EXPIRED');
    }

    const [userRows] = await pool.query(
      `SELECT id, username, email, full_name, role, status
       FROM users WHERE id = ? LIMIT 1`,
      [resetRecord.user_id]
    );
    user = userRows[0];
  } else if (otp && String(otp).trim()) {
    // Case 2: Fallback via OTP verification
    if (usernameOrEmail && String(usernameOrEmail).trim()) {
      const term = String(usernameOrEmail).trim();
      const [rows] = await pool.query(
        `SELECT id, username, email, full_name, role, status
         FROM users WHERE (username = ? OR email = ?) AND role = 'ADMIN' LIMIT 1`,
        [term, term]
      );
      user = rows[0];
    } else {
      const [rows] = await pool.query(
        `SELECT id, username, email, full_name, role, status
         FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1`
      );
      user = rows[0];
    }

    if (!user) {
      throw ApiError.notFound('Admin account not found', 'ADMIN_NOT_FOUND');
    }

    const [resetRows] = await pool.query(
      `SELECT id, otp, expires_at, is_used
       FROM password_resets
       WHERE user_id = ? AND is_used = FALSE AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    resetRecord = resetRows[0];

    if (!resetRecord) {
      throw ApiError.badRequest('OTP has expired or is invalid. Please request a new link.', 'OTP_EXPIRED');
    }

    if (resetRecord.otp && resetRecord.otp.trim() !== String(otp).trim()) {
      throw ApiError.badRequest('Invalid OTP. Please check your email and try again.', 'OTP_MISMATCH');
    }
  } else {
    throw ApiError.badRequest('Reset token or OTP is required', 'MISSING_RESET_TOKEN');
  }

  if (!user) {
    throw ApiError.notFound('Admin account not found', 'ADMIN_NOT_FOUND');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update password in DB
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

  // Invalidate reset token / OTP
  await pool.query('UPDATE password_resets SET is_used = TRUE WHERE id = ?', [resetRecord.id]);

  await writeAudit({
    userId: user.id,
    action: 'PASSWORD_RESET_SUCCESS',
    entity: 'user',
    entityId: user.id,
    description: `Admin password successfully reset for ${user.username}`,
  });

  return {
    success: true,
    message: 'Password reset successfully! You can now log in with your new password.',
  };
}
