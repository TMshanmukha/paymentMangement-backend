import { pool } from '../db/pool.js';
import { scopeForRole } from '../middleware/auth.js';

const scopeCol = (col) => col; // helper for readability in SQL below

/** Applies role-based scoping to a collection-summary WHERE clause. */
function scopeClause(scope, alias = '') {
  const col = alias ? `${alias}.student_type` : 'student_type';
  return scope ? { sql: `AND ${col} = ?`, param: scope } : { sql: '', param: null };
}

export async function getDashboardSummary(user, academicYearId) {
  const scope = scopeForRole(user.role);
  const sc = scopeClause(scope);

  const [[todayRow]] = await pool.query(
    `SELECT
       COALESCE(SUM(amount),0) AS today_collection,
       COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_collection,
       COALESCE(SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END),0) AS upi_collection,
       COALESCE(SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END),0) AS school_collection,
       COALESCE(SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END),0) AS tuition_collection,
       COUNT(*) AS today_transaction_count
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() ${sc.sql} AND academic_year_id = ?`,
    sc.param ? [sc.param, academicYearId] : [academicYearId]
  );

  const [[expenseRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS today_expenses
     FROM expenses WHERE status='ACTIVE' AND expense_date = CURDATE()
     ${scope ? 'AND expense_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [[dueRow]] = await pool.query(
    `SELECT COALESCE(SUM(due_amount),0) AS total_outstanding_due,
            COUNT(*) AS total_students,
            SUM(CASE WHEN due_amount > 0 THEN 1 ELSE 0 END) AS students_with_due,
            SUM(CASE WHEN due_amount <= 0 THEN 1 ELSE 0 END) AS students_fully_paid
     FROM v_student_dues WHERE status='ACTIVE' ${scope ? 'AND student_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [recentPayments] = await pool.query(
    `SELECT p.receipt_number, s.name AS student_name, p.student_type, p.amount,
            p.payment_method, u.full_name AS accountant_name, p.payment_time
     FROM payments p JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by
     WHERE p.status='COMPLETED' ${scope ? 'AND p.student_type = ?' : ''} AND p.academic_year_id = ?
     ORDER BY p.payment_time DESC LIMIT 8`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [recentExpenses] = await pool.query(
    `SELECT e.amount, c.name AS category_name, e.expense_type, e.expense_date, u.full_name AS created_by_name
     FROM expenses e JOIN expense_categories c ON c.id=e.category_id JOIN users u ON u.id=e.created_by
     WHERE e.status='ACTIVE' ${scope ? 'AND e.expense_type = ?' : ''} AND e.academic_year_id = ?
     ORDER BY e.created_at DESC LIMIT 8`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [monthlyChart] = await pool.query(
    `SELECT DATE_FORMAT(payment_date,'%Y-%m') AS month,
            SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END) AS school,
            SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END) AS tuition,
            SUM(amount) AS total
     FROM payments
     WHERE status='COMPLETED' AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) ${sc.sql} AND academic_year_id = ?
     GROUP BY month ORDER BY month`,
    sc.param ? [sc.param, academicYearId] : [academicYearId]
  );

  const isAccountant = user.role !== 'ADMIN';

  return {
    todayCollection: Number(todayRow.today_collection),
    todayExpenses: isAccountant ? 0 : Number(expenseRow.today_expenses),
    todayNetCollection: isAccountant ? Number(todayRow.today_collection) : Number(todayRow.today_collection) - Number(expenseRow.today_expenses),
    totalOutstandingDue: Number(dueRow.total_outstanding_due),
    schoolCollection: scope === 'TUITION' ? 0 : Number(todayRow.school_collection),
    tuitionCollection: scope === 'SCHOOL' ? 0 : Number(todayRow.tuition_collection),
    cashCollection: Number(todayRow.cash_collection),
    upiCollection: Number(todayRow.upi_collection),
    todayTransactionCount: Number(todayRow.today_transaction_count),
    studentSummary: {
      totalStudents: Number(dueRow.total_students),
      studentsWithDue: Number(dueRow.students_with_due),
      studentsFullyPaid: Number(dueRow.students_fully_paid),
    },
    recentPayments,
    recentExpenses: isAccountant ? [] : recentExpenses,
    monthlyChart: monthlyChart.map(m => ({
      month: m.month,
      school: scope === 'TUITION' ? 0 : Number(m.school),
      tuition: scope === 'SCHOOL' ? 0 : Number(m.tuition),
      total: scope === 'SCHOOL' ? Number(m.school) : (scope === 'TUITION' ? Number(m.tuition) : Number(m.total))
    })),
  };
}

export async function getDailyReport(user, date, academicYearId) {
  const scope = scopeForRole(user.role);
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const sc = scopeClause(scope, 'p');

  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount),0) AS total_collection,
            COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_collection,
            COALESCE(SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END),0) AS upi_collection,
            COALESCE(SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END),0) AS school_collection,
            COALESCE(SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END),0) AS tuition_collection
     FROM payments p WHERE status='COMPLETED' AND payment_date = ? ${sc.sql} AND p.academic_year_id = ?`,
    sc.param ? [targetDate, sc.param, academicYearId] : [targetDate, academicYearId]
  );

  const [accountantBreakdown] = await pool.query(
    `SELECT * FROM v_accountant_daily_summary WHERE payment_date = ? AND academic_year_id = ? ${scope ? 'AND received_by IN (SELECT id FROM users WHERE role = ?)' : ''}`,
    scope ? [targetDate, academicYearId, scope === 'SCHOOL' ? 'SCHOOL_ACCOUNTANT' : 'TUITION_ACCOUNTANT'] : [targetDate, academicYearId]
  );

  const [transactions] = await pool.query(
    `SELECT p.receipt_number, s.name AS student_name, s.parent_name, p.student_type, p.amount,
            p.payment_method, p.payment_date, p.payment_time, u.full_name AS entered_by, p.status
     FROM payments p JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by
     WHERE p.payment_date = ? ${sc.sql} AND p.academic_year_id = ?
     ORDER BY p.payment_time ASC`,
    sc.param ? [targetDate, sc.param, academicYearId] : [targetDate, academicYearId]
  );

  const [[expenseSummary]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total_expenses FROM expenses
     WHERE status='ACTIVE' AND expense_date = ? ${scope ? 'AND expense_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [targetDate, scope, academicYearId] : [targetDate, academicYearId]
  );

  return {
    date: targetDate,
    summary,
    accountantBreakdown,
    transactions,
    expenses: expenseSummary.total_expenses,
    netCollection: summary.total_collection - expenseSummary.total_expenses,
  };
}

export async function getMonthlyReport(user, year, month, academicYearId) {
  const scope = scopeForRole(user.role);
  const sc = scopeClause(scope);

  const [[collection]] = await pool.query(
    `SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount),0) AS total_collection,
            COALESCE(SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END),0) AS school_collection,
            COALESCE(SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END),0) AS tuition_collection,
            COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_collection,
            COALESCE(SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END),0) AS upi_collection
     FROM payments WHERE status='COMPLETED' AND YEAR(payment_date)=? AND MONTH(payment_date)=? ${sc.sql} AND academic_year_id = ?`,
    sc.param ? [year, month, sc.param, academicYearId] : [year, month, academicYearId]
  );

  const [[expenses]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total_expenses,
            COALESCE(SUM(CASE WHEN expense_type='SCHOOL' THEN amount ELSE 0 END),0) AS school_expenses,
            COALESCE(SUM(CASE WHEN expense_type='TUITION' THEN amount ELSE 0 END),0) AS tuition_expenses
     FROM expenses WHERE status='ACTIVE' AND YEAR(expense_date)=? AND MONTH(expense_date)=? ${scope ? 'AND expense_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [year, month, scope, academicYearId] : [year, month, academicYearId]
  );

  const [dailyChart] = await pool.query(
    `SELECT payment_date,
            SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END) AS cash,
            SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END) AS upi,
            SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END) AS school,
            SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END) AS tuition,
            SUM(amount) AS total
     FROM payments
     WHERE status='COMPLETED' AND YEAR(payment_date)=? AND MONTH(payment_date)=? ${sc.sql} AND academic_year_id = ?
     GROUP BY payment_date ORDER BY payment_date`,
    sc.param ? [year, month, sc.param, academicYearId] : [year, month, academicYearId]
  );

  const [[studentSummary]] = await pool.query(
    `SELECT COUNT(*) AS total_students,
            SUM(CASE WHEN due_amount > 0 THEN 1 ELSE 0 END) AS students_with_due,
            SUM(CASE WHEN due_amount <= 0 THEN 1 ELSE 0 END) AS students_fully_paid
     FROM v_student_dues WHERE status='ACTIVE' ${scope ? 'AND student_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  return {
    year, month,
    collection,
    expenses,
    netAmount: collection.total_collection - expenses.total_expenses,
    dailyChart,
    studentSummary,
  };
}

export async function getDateRangeReport(user, fromDate, toDate, academicYearId) {
  const scope = scopeForRole(user.role);
  const sc = scopeClause(scope);

  const [[collection]] = await pool.query(
    `SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount),0) AS total_collection,
            COALESCE(SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END),0) AS school_collection,
            COALESCE(SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END),0) AS tuition_collection,
            COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_collection,
            COALESCE(SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END),0) AS upi_collection
     FROM payments WHERE status='COMPLETED' AND payment_date BETWEEN ? AND ? ${sc.sql} AND academic_year_id = ?`,
    sc.param ? [fromDate, toDate, sc.param, academicYearId] : [fromDate, toDate, academicYearId]
  );

  const [[expenses]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total_expenses
     FROM expenses WHERE status='ACTIVE' AND expense_date BETWEEN ? AND ? ${scope ? 'AND expense_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [fromDate, toDate, scope, academicYearId] : [fromDate, toDate, academicYearId]
  );

  const [dailyBreakdown] = await pool.query(
    `SELECT payment_date, COUNT(*) AS transaction_count, SUM(amount) AS total,
            SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END) AS cash,
            SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END) AS upi
     FROM payments WHERE status='COMPLETED' AND payment_date BETWEEN ? AND ? ${sc.sql} AND academic_year_id = ?
     GROUP BY payment_date ORDER BY payment_date`,
    sc.param ? [fromDate, toDate, sc.param, academicYearId] : [fromDate, toDate, academicYearId]
  );

  return {
    fromDate, toDate,
    collection,
    expenses: expenses.total_expenses,
    netAmount: collection.total_collection - expenses.total_expenses,
    dailyBreakdown,
  };
}

export async function getAccountantReport(user, accountantId, fromDate, toDate, academicYearId) {
  // Non-admins can only view their own report
  const targetId = user.role === 'ADMIN' ? accountantId : user.id;

  const [[summary]] = await pool.query(
    `SELECT u.full_name, u.role, COUNT(*) AS total_transactions,
            COALESCE(SUM(CASE WHEN p.payment_method='CASH' THEN p.amount ELSE 0 END),0) AS cash_collected,
            COALESCE(SUM(CASE WHEN p.payment_method='UPI' THEN p.amount ELSE 0 END),0) AS upi_collected,
            COALESCE(SUM(p.amount),0) AS total_collection
     FROM users u LEFT JOIN payments p ON p.received_by = u.id AND p.status='COMPLETED'
       AND p.payment_date BETWEEN ? AND ? AND p.academic_year_id = ?
     WHERE u.id = ? GROUP BY u.id, u.full_name, u.role`,
    [fromDate, toDate, academicYearId, targetId]
  );

  const [dayClosings] = await pool.query(
    `SELECT closing_date, status, overall_total, submitted_at, approved_at
     FROM day_closings WHERE user_id = ? AND closing_date BETWEEN ? AND ? AND academic_year_id = ? ORDER BY closing_date DESC`,
    [targetId, fromDate, toDate, academicYearId]
  );

  return { summary: summary || { total_transactions: 0 }, dayClosings };
}

export async function getDueReport(user, query) {
  const scope = scopeForRole(user.role);
  const { studentType, academicYearId, className, fullyPaid, search, page = 1, pageSize = 50 } = query;

  const where = ["status = 'ACTIVE'"];
  const params = [];
  if (scope) { where.push('student_type = ?'); params.push(scope); }
  else if (studentType) { where.push('student_type = ?'); params.push(studentType); }
  if (academicYearId) { where.push('academic_year_id = ?'); params.push(academicYearId); }
  if (className) { where.push('class = ?'); params.push(className); }
  if (fullyPaid === 'true') where.push('due_amount <= 0');
  else if (fullyPaid === 'false') where.push('due_amount > 0');
  if (search) {
    where.push('(student_name LIKE ? OR parent_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT * FROM v_student_dues ${whereSql} ORDER BY due_amount DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM v_student_dues ${whereSql}`, params);

  return { items: rows, total, page: Number(page), pageSize: Number(pageSize) };
}
