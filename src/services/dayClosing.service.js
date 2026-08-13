import { pool, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';

/** Computes what the accountant SHOULD have collected on a date, from actual payment rows. */
export async function getExpectedCollection(userId, date) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount),0) AS overall_total,
            COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_total,
            COALESCE(SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END),0) AS upi_total
     FROM payments WHERE received_by = ? AND payment_date = ? AND status='COMPLETED'`,
    [userId, date]
  );
  return row;
}

export async function listDayClosings(user, query) {
  const { fromDate, toDate, status, userId } = query;
  const where = [];
  const params = [];

  if (user.role !== 'ADMIN') {
    where.push('user_id = ?');
    params.push(user.id);
  } else if (userId) {
    where.push('user_id = ?');
    params.push(userId);
  }
  if (fromDate && toDate) { where.push('closing_date BETWEEN ? AND ?'); params.push(fromDate, toDate); }
  if (status) { where.push('status = ?'); params.push(status); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT dc.*, u.full_name AS accountant_name, a.full_name AS approved_by_name
     FROM day_closings dc
     JOIN users u ON u.id = dc.user_id
     LEFT JOIN users a ON a.id = dc.approved_by
     ${whereSql} ORDER BY dc.closing_date DESC`,
    params
  );
  return rows;
}

export async function submitDayClosing(user, { closingDate, notes }) {
  return withTransaction(async (conn) => {
    const [existingRows] = await conn.query(
      'SELECT * FROM day_closings WHERE user_id = ? AND closing_date = ? FOR UPDATE',
      [user.id, closingDate]
    );
    const existing = existingRows[0];
    if (existing && existing.status !== 'REOPENED' && existing.status !== 'OPEN') {
      throw ApiError.conflict('This day has already been submitted for closing', 'ALREADY_SUBMITTED');
    }

    const [[expected]] = await conn.query(
      `SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount),0) AS overall_total,
              COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_total,
              COALESCE(SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END),0) AS upi_total
       FROM payments WHERE received_by = ? AND payment_date = ? AND status='COMPLETED'`,
      [user.id, closingDate]
    );

    if (existing) {
      await conn.query(
        `UPDATE day_closings SET cash_total=?, upi_total=?, overall_total=?, transaction_count=?,
                status='SUBMITTED', submitted_at=NOW(), notes=? WHERE id=?`,
        [expected.cash_total, expected.upi_total, expected.overall_total, expected.transaction_count, notes || null, existing.id]
      );
    } else {
      await conn.query(
        `INSERT INTO day_closings (user_id, closing_date, cash_total, upi_total, overall_total, transaction_count, status, submitted_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW(), ?)`,
        [user.id, closingDate, expected.cash_total, expected.upi_total, expected.overall_total, expected.transaction_count, notes || null]
      );
    }

    await writeAudit({
      conn,
      userId: user.id,
      action: 'DAY_CLOSING_SUBMITTED',
      entity: 'day_closing',
      description: `Day closing submitted for ${closingDate}: ₹${expected.overall_total}`,
    });

    const [rows] = await conn.query('SELECT * FROM day_closings WHERE user_id=? AND closing_date=?', [user.id, closingDate]);
    return rows[0];
  });
}

export async function approveDayClosing(admin, id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM day_closings WHERE id = ? FOR UPDATE', [id]);
    const closing = rows[0];
    if (!closing) throw ApiError.notFound('Day closing not found', 'DAY_CLOSING_NOT_FOUND');
    if (closing.status !== 'SUBMITTED') throw ApiError.badRequest('Only submitted closings can be approved', 'INVALID_STATUS');

    await conn.query(
      `UPDATE day_closings SET status='APPROVED', approved_by=?, approved_at=NOW() WHERE id=?`,
      [admin.id, id]
    );
    await writeAudit({
      conn,
      userId: admin.id,
      action: 'DAY_CLOSING_APPROVED',
      entity: 'day_closing',
      entityId: id,
      description: `Day closing #${id} approved`,
    });

    const [updated] = await conn.query('SELECT * FROM day_closings WHERE id=?', [id]);
    return updated[0];
  });
}

export async function reopenDayClosing(admin, id, reason) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM day_closings WHERE id = ? FOR UPDATE', [id]);
    const closing = rows[0];
    if (!closing) throw ApiError.notFound('Day closing not found', 'DAY_CLOSING_NOT_FOUND');
    if (closing.status !== 'APPROVED' && closing.status !== 'SUBMITTED') {
      throw ApiError.badRequest('Only submitted or approved closings can be reopened', 'INVALID_STATUS');
    }

    await conn.query(`UPDATE day_closings SET status='REOPENED', notes=CONCAT(COALESCE(notes,''), ' | Reopened: ', ?) WHERE id=?`, [reason, id]);
    await writeAudit({
      conn,
      userId: admin.id,
      action: 'DAY_CLOSING_REOPENED',
      entity: 'day_closing',
      entityId: id,
      description: `Day closing #${id} reopened: ${reason}`,
    });

    const [updated] = await conn.query('SELECT * FROM day_closings WHERE id=?', [id]);
    return updated[0];
  });
}
