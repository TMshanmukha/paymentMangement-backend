import { pool } from '../db/pool.js';

export async function listAuditLogs(query) {
  const { fromDate, toDate, action, userId, entity, page = 1, pageSize = 50 } = query;
  const where = [];
  const params = [];

  if (fromDate && toDate) { where.push('DATE(a.created_at) BETWEEN ? AND ?'); params.push(fromDate, toDate); }
  if (action) { where.push('a.action = ?'); params.push(action); }
  if (userId) { where.push('a.user_id = ?'); params.push(userId); }
  if (entity) { where.push('a.entity = ?'); params.push(entity); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(pageSize);

  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.description, a.ip_address, a.created_at,
            u.full_name AS user_name, u.role AS user_role
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${whereSql} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);

  return { items: rows, total, page: Number(page), pageSize: Number(pageSize) };
}
