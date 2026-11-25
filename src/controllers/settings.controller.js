import { asyncHandler } from '../utils/asyncHandler.js';
import * as settingsService from '../services/settings.service.js';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function isRequestFromAdmin(req) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return false;
    const payload = verifyToken(token);
    const [rows] = await pool.query(
      "SELECT role, status FROM users WHERE id = ? LIMIT 1",
      [payload.sub]
    );
    return rows[0]?.role === 'ADMIN' && rows[0]?.status === 'ACTIVE';
  } catch {
    return false;
  }
}

export const getAll = asyncHandler(async (req, res) => {
  const data = await settingsService.getAllSettings();
  const isAdmin = await isRequestFromAdmin(req);

  if (isAdmin) {
    // Provide effective reset email to authenticated admin
    if (!data.admin_reset_email) {
      data.admin_reset_email = env.ADMIN_RESET_EMAIL || 'shanmu547@gmail.com';
    }
  } else {
    // Never expose private admin reset email on public unauthenticated calls
    delete data.admin_reset_email;
  }

  res.json({ success: true, data });
});

export const update = asyncHandler(async (req, res) => {
  const { key } = req.body;
  let { value } = req.body;

  if (!key || typeof key !== 'string') {
    throw ApiError.badRequest('Setting key is required', 'INVALID_KEY');
  }

  if (key === 'admin_reset_email') {
    const trimmed = String(value ?? '').trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      throw ApiError.badRequest('Please enter a valid email address', 'INVALID_EMAIL');
    }
    value = trimmed;
  }

  const data = await settingsService.updateSetting(key, value);

  if (key === 'admin_reset_email') {
    await writeAudit({
      userId: req.user.id,
      action: 'UPDATE_SETTING',
      entity: 'app_settings',
      entityId: req.user.id,
      description: `Admin password reset email updated to ${value}`,
    });
  }

  res.json({ success: true, message: 'Settings updated', data });
});
