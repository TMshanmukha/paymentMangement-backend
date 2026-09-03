import { pool, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { scopeForRole } from '../middleware/auth.js';

// Short-lived in-memory guard against duplicate submissions from a double
// click / repeated request with the same idempotency key. A real deployment
// with multiple server instances should back this with Redis; single-instance
// deployments (the expected setup here) are safe with an in-memory map.
const recentRequestIds = new Map();
const IDEMPOTENCY_TTL_MS = 60_000;
function seenRecently(key) {
  if (!key) return false;
  const now = Date.now();
  for (const [k, ts] of recentRequestIds) {
    if (now - ts > IDEMPOTENCY_TTL_MS) recentRequestIds.delete(k);
  }
  if (recentRequestIds.has(key)) return true;
  recentRequestIds.set(key, now);
  return false;
}

async function getOverpaymentSetting(conn) {
  const [rows] = await conn.query("SELECT setting_value FROM app_settings WHERE setting_key = 'allow_overpayment' LIMIT 1");
  return rows[0]?.setting_value === 'true';
}

function getIndiaDateTimeString() {
  const d = new Date();
  const tzString = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzString);
  const yyyy = localDate.getFullYear();
  const mm = String(localDate.getMonth() + 1).padStart(2, '0');
  const dd = String(localDate.getDate()).padStart(2, '0');
  const hh = String(localDate.getHours()).padStart(2, '0');
  const min = String(localDate.getMinutes()).padStart(2, '0');
  const ss = String(localDate.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function getIndiaDateString(d) {
  const dateObj = new Date(d);
  const tzString = dateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzString);
  const yyyy = localDate.getFullYear();
  const mm = String(localDate.getMonth() + 1).padStart(2, '0');
  const dd = String(localDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Creates a payment inside a DB transaction with row locks, per spec section 38/15:
 *   1. Validate role can touch this student_type
 *   2. Lock + validate student is ACTIVE and matches type
 *   3. Lock + sum existing COMPLETED payments to get true current due
 *   4. Validate amount > 0 and (amount <= due OR overpayment allowed)
 *   5. Insert payment (receipt_number auto-set by DB trigger)
 *   6. Write audit log
 * All in one transaction so a double-submit can't both read a stale due.
 */
export async function createPayment(user, data) {
  if (seenRecently(data.clientRequestId)) {
    throw ApiError.conflict('This payment was already submitted. Refresh to check before retrying.', 'DUPLICATE_SUBMISSION');
  }

  if (user.role === 'ADMIN' && !data.digitalSignature) {
    throw ApiError.badRequest('Digital signature is required for admin payments', 'SIGNATURE_REQUIRED');
  }

  const scope = scopeForRole(user.role);

  return withTransaction(async (conn) => {
    const [studentRows] = await conn.query('SELECT * FROM students WHERE id = ? FOR UPDATE', [data.studentId]);
    const student = studentRows[0];
    if (!student) throw ApiError.notFound('Student not found', 'STUDENT_NOT_FOUND');
    if (student.status !== 'ACTIVE') throw ApiError.badRequest('Cannot record payment for an inactive student', 'STUDENT_INACTIVE');

    if (scope && scope !== student.student_type) {
      throw ApiError.forbidden(
        `${scope === 'SCHOOL' ? 'School' : 'Tuition'} accountants cannot record payments for ${student.student_type.toLowerCase()} students`,
        'STUDENT_TYPE_NOT_ALLOWED'
      );
    }

    const [paidRows] = await conn.query(
      "SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE student_id = ? AND status = 'COMPLETED' FOR UPDATE",
      [data.studentId]
    );
    const alreadyPaid = Number(paidRows[0].paid);
    const currentDue = Number(student.total_fee) - alreadyPaid;

    if (data.amount <= 0) throw ApiError.badRequest('Payment amount must be greater than zero', 'AMOUNT_INVALID');

    const joiningDateStr = getIndiaDateString(student.joining_date);
    if (data.paymentDate < joiningDateStr) {
      throw ApiError.badRequest(
        `Payment date (${data.paymentDate}) cannot be before the student's joining date (${joiningDateStr})`,
        'PAYMENT_DATE_BEFORE_JOINING'
      );
    }

    const allowOverpayment = await getOverpaymentSetting(conn);
    if (data.amount > currentDue && !allowOverpayment) {
      throw ApiError.badRequest(
        `Payment amount (₹${data.amount}) exceeds the remaining due (₹${currentDue})`,
        'PAYMENT_EXCEEDS_DUE'
      );
    }

    const tempReceipt = 'TEMP-' + Math.random().toString(36).substring(2, 10);
    const indiaDateTime = getIndiaDateTimeString();

    const [result] = await conn.query(
      `INSERT INTO payments
         (receipt_number, student_id, academic_year_id, student_type, amount, payment_method,
          payment_date, payment_time, remarks, received_by, status, digital_signature)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)`,
      [
        tempReceipt,
        data.studentId,
        student.academic_year_id,
        student.student_type,
        data.amount,
        data.paymentMethod,
        data.paymentDate,
        indiaDateTime,
        data.remarks || null,
        user.id,
        user.role === 'ADMIN' ? (data.digitalSignature || null) : null,
      ]
    );

    const insertId = result.insertId;
    const receiptNumber = `REC-${String(insertId).padStart(6, '0')}`;

    await conn.query(
      'UPDATE payments SET receipt_number = ? WHERE id = ?',
      [receiptNumber, insertId]
    );

    await writeAudit({
      conn,
      userId: user.id,
      action: 'PAYMENT_CREATED',
      entity: 'payment',
      entityId: result.insertId,
      description: `₹${data.amount} (${data.paymentMethod}) recorded for student #${data.studentId}`,
    });

    const [paymentRows] = await conn.query(
      `SELECT p.*, s.name AS student_name, s.parent_name, s.student_code, s.class, s.section,
              s.total_fee, u.full_name AS received_by_name
       FROM payments p
       JOIN students s ON s.id = p.student_id
       JOIN users u ON u.id = p.received_by
       WHERE p.id = ?`,
      [result.insertId]
    );
    const payment = paymentRows[0];
    const [sumRows] = await conn.query(
      "SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE student_id = ? AND status = 'COMPLETED'",
      [payment.student_id]
    );
    const totalPaid = Number(sumRows[0].paid);
    payment.total_paid_to_date = totalPaid;
    payment.previous_paid = payment.status === 'COMPLETED' ? totalPaid - Number(payment.amount) : null;
    payment.remaining_due = Number(payment.total_fee) - totalPaid;
    return payment;
  });
}

export async function getPaymentById(user, id) {
  const scope = scopeForRole(user.role);
  const [rows] = await pool.query(
    `SELECT p.*, s.name AS student_name, s.parent_name, s.student_code, s.class, s.section,
            s.total_fee, u.full_name AS received_by_name
     FROM payments p
     JOIN students s ON s.id = p.student_id
     JOIN users u ON u.id = p.received_by
     WHERE p.id = ? LIMIT 1`,
    [id]
  );
  const payment = rows[0];
  if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  if (scope && scope !== payment.student_type) throw ApiError.forbidden('Not allowed to view this payment', 'NOT_ALLOWED');

  // previous paid / total paid at time of viewing, for receipt display
  const [sumRows] = await pool.query(
    "SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE student_id = ? AND status = 'COMPLETED'",
    [payment.student_id]
  );
  const totalPaid = Number(sumRows[0].paid);
  payment.total_paid_to_date = totalPaid;
  payment.previous_paid = payment.status === 'COMPLETED' ? totalPaid - Number(payment.amount) : null;
  payment.remaining_due = Number(payment.total_fee) - totalPaid;
  return payment;
}

export async function listPayments(user, query) {
  const scope = scopeForRole(user.role);
  const { date, fromDate, toDate, studentType, paymentMethod, receivedBy, status, search, academicYearId, page, pageSize } = query;

  const where = [];
  const params = [];

  if (scope) {
    where.push('p.student_type = ?');
    params.push(scope);
  } else if (studentType) {
    where.push('p.student_type = ?');
    params.push(studentType);
  }
  if (date) {
    where.push('p.payment_date = ?');
    params.push(date);
  }
  if (fromDate && toDate) {
    where.push('p.payment_date BETWEEN ? AND ?');
    params.push(fromDate, toDate);
  }
  if (paymentMethod) {
    where.push('p.payment_method = ?');
    params.push(paymentMethod);
  }
  if (receivedBy) {
    where.push('p.received_by = ?');
    params.push(receivedBy);
  }
  if (academicYearId) {
    where.push('p.academic_year_id = ?');
    params.push(academicYearId);
  }
  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(LOWER(s.name) LIKE ? OR LOWER(s.parent_name) LIKE ? OR LOWER(p.receipt_number) LIKE ? OR LOWER(s.student_code) LIKE ? OR LOWER(s.parent_phone) LIKE ? OR LOWER(s.student_phone) LIKE ?)');
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT p.id, p.receipt_number, p.student_id, s.name AS student_name, s.parent_name,
            p.student_type, p.amount, p.payment_method, p.payment_date, p.payment_time,
            p.status, u.full_name AS received_by_name
     FROM payments p
     JOIN students s ON s.id = p.student_id
     JOIN users u ON u.id = p.received_by
     ${whereSql}
     ORDER BY p.payment_date DESC, p.payment_time DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM payments p JOIN students s ON s.id = p.student_id ${whereSql}`,
    params
  );

  return { items: rows, total: countRows[0].total, page, pageSize };
}

async function setPaymentStatus(user, id, newStatus, reason) {
  if (user.role !== 'ADMIN') throw ApiError.forbidden('Only Admin can cancel or reverse payments', 'ADMIN_ONLY');

  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM payments WHERE id = ? FOR UPDATE', [id]);
    const payment = rows[0];
    if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
    if (payment.status !== 'COMPLETED') {
      throw ApiError.badRequest(`Payment is already ${payment.status.toLowerCase()}`, 'PAYMENT_NOT_ACTIVE');
    }

    await conn.query(
      `UPDATE payments SET status = ?, cancelled_by = ?, cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?`,
      [newStatus, user.id, reason, id]
    );

    await writeAudit({
      conn,
      userId: user.id,
      action: newStatus === 'CANCELLED' ? 'PAYMENT_CANCELLED' : 'PAYMENT_REVERSED',
      entity: 'payment',
      entityId: id,
      description: `Receipt ${payment.receipt_number} ${newStatus.toLowerCase()}: ${reason}`,
    });

    const [updated] = await conn.query('SELECT * FROM payments WHERE id = ?', [id]);
    return updated[0];
  });
}

export const cancelPayment = (user, id, reason) => setPaymentStatus(user, id, 'CANCELLED', reason);
export const reversePayment = (user, id, reason) => setPaymentStatus(user, id, 'REVERSED', reason);
