import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';

const SALT_ROUNDS = 10;

export async function listUsers() {
  const [rows] = await pool.query(
    `SELECT id, username, email, full_name, phone, role, status, last_login_at, created_at
     FROM users WHERE role != 'ADMIN' ORDER BY created_at DESC`
  );
  return rows;
}

export async function createUser(admin, data) {
  const [dupe] = await pool.query('SELECT id FROM users WHERE username = ?', [data.username]);
  if (dupe.length) throw ApiError.conflict('Username already exists', 'USERNAME_TAKEN');

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  const [result] = await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, phone, role, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    [data.username, data.email || null, passwordHash, data.fullName, data.phone || null, data.role, admin.id]
  );

  await writeAudit({
    userId: admin.id,
    action: 'USER_CREATED',
    entity: 'user',
    entityId: result.insertId,
    description: `${data.fullName} added as ${data.role}`,
  });

  const [rows] = await pool.query('SELECT id, username, email, full_name, phone, role, status FROM users WHERE id=?', [result.insertId]);
  return rows[0];
}

export async function updateUser(admin, id, data) {
  const [existingRows] = await pool.query('SELECT * FROM users WHERE id = ? AND role != "ADMIN"', [id]);
  if (!existingRows[0]) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  const fields = [];
  const params = [];
  const map = { fullName: 'full_name', email: 'email', phone: 'phone' };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${col} = ?`); params.push(data[key] === '' ? null : data[key]); }
  }
  if (fields.length) {
    params.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  const [rows] = await pool.query('SELECT id, username, email, full_name, phone, role, status FROM users WHERE id=?', [id]);
  return rows[0];
}

export async function updateUserStatus(admin, id, status) {
  const [existingRows] = await pool.query('SELECT * FROM users WHERE id = ? AND role != "ADMIN"', [id]);
  if (!existingRows[0]) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  await writeAudit({
    userId: admin.id,
    action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'user',
    entityId: id,
    description: `User #${id} set to ${status}`,
  });

  const [rows] = await pool.query('SELECT id, username, email, full_name, phone, role, status FROM users WHERE id=?', [id]);
  return rows[0];
}

export async function resetPassword(admin, id, newPassword) {
  const [existingRows] = await pool.query('SELECT * FROM users WHERE id = ? AND role != "ADMIN"', [id]);
  if (!existingRows[0]) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  await writeAudit({
    userId: admin.id,
    action: 'USER_PASSWORD_RESET',
    entity: 'user',
    entityId: id,
    description: `Password reset for user #${id}`,
  });
  return { success: true };
}
