import { pool } from '../db/pool.js';
import { scopeForRole } from '../middleware/auth.js';

const scopeCol = (col) => col; // helper for readability in SQL below

/** Applies role-based scoping to a collection-summary WHERE clause. */
function scopeClause(scope, alias = '') {
  const col = alias ? `${alias}.student_type` : 'student_type';
  return scope ? { sql: `AND ${col} = ?`, param: scope } : { sql: '', param: null };
}

function getEffectiveScope(userRole, filterType) {
  const scope = scopeForRole(userRole);
  if (scope) return scope; // Staff is always restricted to their scope
  if (filterType === 'SCHOOL' || filterType === 'TUITION') return filterType; // Admin filter
  return null; // All
}

export async function getDashboardSummary(user, academicYearId) {
  const scope = scopeForRole(user.role);
  const sc = scopeClause(scope);
  const scp = scopeClause(scope, 'p');

  const [[collectionRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS today_collection, COUNT(*) AS today_count
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() ${sc.sql} AND academic_year_id = ?`,
    sc.param ? [sc.param, academicYearId] : [academicYearId]
  );

  const [[dueRow]] = await pool.query(
    `SELECT COALESCE(SUM(due_amount),0) AS total_outstanding_due,
            COUNT(*) AS total_students,
            SUM(CASE WHEN due_amount > 0 THEN 1 ELSE 0 END) AS students_with_due,
            SUM(CASE WHEN due_amount <= 0 THEN 1 ELSE 0 END) AS students_fully_paid
     FROM v_student_dues WHERE status='ACTIVE' ${scope ? 'AND student_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [[schoolDueRow]] = await pool.query(
    `SELECT COALESCE(SUM(due_amount),0) AS total_outstanding_due,
            COUNT(*) AS total_students,
            SUM(CASE WHEN due_amount > 0 THEN 1 ELSE 0 END) AS students_with_due,
            SUM(CASE WHEN due_amount <= 0 THEN 1 ELSE 0 END) AS students_fully_paid
     FROM v_student_dues WHERE status='ACTIVE' AND student_type = 'SCHOOL' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[tuitionDueRow]] = await pool.query(
    `SELECT COALESCE(SUM(due_amount),0) AS total_outstanding_due,
            COUNT(*) AS total_students,
            SUM(CASE WHEN due_amount > 0 THEN 1 ELSE 0 END) AS students_with_due,
            SUM(CASE WHEN due_amount <= 0 THEN 1 ELSE 0 END) AS students_fully_paid
     FROM v_student_dues WHERE status='ACTIVE' AND student_type = 'TUITION' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[expenseRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS today_expenses
     FROM expenses WHERE status='ACTIVE' AND expense_date = CURDATE() ${scope ? 'AND expense_type = ?' : ''} AND academic_year_id = ?`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [[schoolRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS school_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND student_type='SCHOOL' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[tuitionRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS tuition_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND student_type='TUITION' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[cashRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS cash_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND payment_method='CASH' ${sc.sql} AND academic_year_id = ?`,
    sc.param ? [sc.param, academicYearId] : [academicYearId]
  );

  const [[upiRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS upi_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND payment_method='UPI' ${sc.sql} AND academic_year_id = ?`,
    sc.param ? [sc.param, academicYearId] : [academicYearId]
  );

  const [[schoolCashRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS cash_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND student_type='SCHOOL' AND payment_method='CASH' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[schoolUpiRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS upi_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND student_type='SCHOOL' AND payment_method='UPI' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[tuitionCashRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS cash_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND student_type='TUITION' AND payment_method='CASH' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [[tuitionUpiRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS upi_collection
     FROM payments WHERE status='COMPLETED' AND payment_date = CURDATE() AND student_type='TUITION' AND payment_method='UPI' AND academic_year_id = ?`,
    [academicYearId]
  );

  const [recentPayments] = await pool.query(
    `SELECT p.receipt_number, s.name AS student_name, p.amount, p.payment_method, p.payment_time, u.full_name AS accountant_name
     FROM payments p
     JOIN students s ON s.id = p.student_id
     JOIN users u ON u.id = p.received_by
     WHERE p.status='COMPLETED' ${scp.sql} AND p.academic_year_id = ?
     ORDER BY p.payment_time DESC LIMIT 5`,
    scp.param ? [scp.param, academicYearId] : [academicYearId]
  );

  const [recentExpenses] = await pool.query(
    `SELECT e.amount, e.expense_type, c.name AS category_name, u.full_name AS created_by_name
     FROM expenses e
     JOIN expense_categories c ON c.id = e.category_id
     JOIN users u ON u.id = e.created_by
     WHERE e.status='ACTIVE' ${scope ? 'AND e.expense_type = ?' : ''} AND e.academic_year_id = ?
     ORDER BY e.expense_date DESC, e.id DESC LIMIT 5`,
    scope ? [scope, academicYearId] : [academicYearId]
  );

  const [chartRows] = await pool.query(
    `SELECT DATE_FORMAT(payment_date, '%b %y') AS month_label,
            SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END) AS school,
            SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END) AS tuition,
            SUM(amount) AS total,
            MIN(payment_date) AS sort_date
     FROM payments
     WHERE status='COMPLETED' ${sc.sql} AND academic_year_id = ?
     GROUP BY DATE_FORMAT(payment_date, '%b %y')
     ORDER BY sort_date ASC`,
    sc.param ? [sc.param, academicYearId] : [academicYearId]
  );

  return {
    todayCollection: Number(collectionRow.today_collection),
    todayTransactionCount: Number(collectionRow.today_count),
    todayExpenses: Number(expenseRow.today_expenses),
    todayNetCollection: Number(collectionRow.today_collection) - Number(expenseRow.today_expenses),
    totalOutstandingDue: Number(dueRow.total_outstanding_due),
    schoolCollection: Number(schoolRow.school_collection),
    tuitionCollection: Number(tuitionRow.tuition_collection),
    cashCollection: Number(cashRow.cash_collection),
    upiCollection: Number(upiRow.upi_collection),
    recentPayments,
    recentExpenses,
    studentSummary: {
      totalStudents: Number(dueRow.total_students),
      studentsWithDue: Number(dueRow.students_with_due),
      studentsFullyPaid: Number(dueRow.students_fully_paid),
    },
    schoolSummary: {
      todayCollection: Number(schoolRow.school_collection),
      cashCollection: Number(schoolCashRow.cash_collection),
      upiCollection: Number(schoolUpiRow.upi_collection),
      totalOutstandingDue: Number(schoolDueRow.total_outstanding_due),
      totalStudents: Number(schoolDueRow.total_students),
      studentsWithDue: Number(schoolDueRow.students_with_due),
      studentsFullyPaid: Number(schoolDueRow.students_fully_paid),
    },
    tuitionSummary: {
      todayCollection: Number(tuitionRow.tuition_collection),
      cashCollection: Number(tuitionCashRow.cash_collection),
      upiCollection: Number(tuitionUpiRow.upi_collection),
      totalOutstandingDue: Number(tuitionDueRow.total_outstanding_due),
      totalStudents: Number(tuitionDueRow.total_students),
      studentsWithDue: Number(tuitionDueRow.students_with_due),
      studentsFullyPaid: Number(tuitionDueRow.students_fully_paid),
    },
    monthlyChart: chartRows.map((m) => ({
      month: m.month_label,
      school: scope === 'TUITION' ? 0 : Number(m.school),
      tuition: scope === 'SCHOOL' ? 0 : Number(m.tuition),
      total: scope === 'SCHOOL' ? Number(m.school) : (scope === 'TUITION' ? Number(m.tuition) : Number(m.total))
    })),
  };
}

export async function getDailyReport(user, date, academicYearId, studentType = null) {
  const effectiveScope = getEffectiveScope(user.role, studentType);
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const sc = scopeClause(effectiveScope, 'p');

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
    `SELECT
       p.payment_date,
       p.received_by,
       u.full_name AS accountant_name,
       u.role AS accountant_role,
       COUNT(*) AS transaction_count,
       SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END) AS cash_total,
       SUM(CASE WHEN p.payment_method = 'UPI'  THEN p.amount ELSE 0 END) AS upi_total,
       SUM(p.amount) AS overall_total
     FROM payments p
     JOIN users u ON u.id = p.received_by
     WHERE p.status = 'COMPLETED' AND p.payment_date = ? ${sc.sql} AND p.academic_year_id = ?
     GROUP BY p.payment_date, p.received_by, u.full_name, u.role`,
    sc.param ? [targetDate, sc.param, academicYearId] : [targetDate, academicYearId]
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
     WHERE status='ACTIVE' AND expense_date = ? ${effectiveScope ? 'AND (expense_type = ? OR expense_type = \'BOTH\')' : ''} AND academic_year_id = ?`,
    effectiveScope ? [targetDate, effectiveScope, academicYearId] : [targetDate, academicYearId]
  );

  const [expenseList] = await pool.query(
    `SELECT e.id, e.amount, e.expense_type, e.payment_method, e.expense_date, e.description,
            c.name AS category_name, u.full_name AS created_by_name
     FROM expenses e
     JOIN expense_categories c ON c.id = e.category_id
     JOIN users u ON u.id = e.created_by
     WHERE e.status='ACTIVE' AND e.expense_date = ? ${effectiveScope ? 'AND (e.expense_type = ? OR e.expense_type = \'BOTH\')' : ''} AND e.academic_year_id = ?
     ORDER BY e.id DESC`,
    effectiveScope ? [targetDate, effectiveScope, academicYearId] : [targetDate, academicYearId]
  );

  return {
    date: targetDate,
    summary,
    accountantBreakdown,
    transactions,
    expenses: Number(expenseSummary.total_expenses),
    expensesList: expenseList,
    netCollection: Number(summary.total_collection) - Number(expenseSummary.total_expenses),
  };
}

export async function getMonthlyReport(user, year, month, academicYearId, studentType = null) {
  const effectiveScope = getEffectiveScope(user.role, studentType);
  const sc = scopeClause(effectiveScope);

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
     FROM expenses WHERE status='ACTIVE' AND YEAR(expense_date)=? AND MONTH(expense_date)=? ${effectiveScope ? 'AND (expense_type = ? OR expense_type = \'BOTH\')' : ''} AND academic_year_id = ?`,
    effectiveScope ? [year, month, effectiveScope, academicYearId] : [year, month, academicYearId]
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
     FROM v_student_dues WHERE status='ACTIVE' ${effectiveScope ? 'AND student_type = ?' : ''} AND academic_year_id = ?`,
    effectiveScope ? [effectiveScope, academicYearId] : [academicYearId]
  );

  const [expenseList] = await pool.query(
    `SELECT e.id, e.amount, e.expense_type, e.payment_method, e.expense_date, e.description,
            c.name AS category_name, u.full_name AS created_by_name
     FROM expenses e
     JOIN expense_categories c ON c.id = e.category_id
     JOIN users u ON u.id = e.created_by
     WHERE e.status='ACTIVE' AND YEAR(e.expense_date)=? AND MONTH(e.expense_date)=? ${effectiveScope ? 'AND (e.expense_type = ? OR e.expense_type = \'BOTH\')' : ''} AND e.academic_year_id = ?
     ORDER BY e.expense_date DESC, e.id DESC`,
    effectiveScope ? [year, month, effectiveScope, academicYearId] : [year, month, academicYearId]
  );

  return {
    year, month,
    collection,
    expenses,
    expensesList: expenseList,
    netAmount: Number(collection.total_collection) - Number(expenses.total_expenses),
    dailyChart,
    studentSummary,
  };
}

export async function getDateRangeReport(user, fromDate, toDate, academicYearId, studentType = null) {
  const effectiveScope = getEffectiveScope(user.role, studentType);
  const sc = scopeClause(effectiveScope);

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
     FROM expenses WHERE status='ACTIVE' AND expense_date BETWEEN ? AND ? ${effectiveScope ? 'AND (expense_type = ? OR expense_type = \'BOTH\')' : ''} AND academic_year_id = ?`,
    effectiveScope ? [fromDate, toDate, effectiveScope, academicYearId] : [fromDate, toDate, academicYearId]
  );

  const [dailyBreakdown] = await pool.query(
    `SELECT payment_date, COUNT(*) AS transaction_count, SUM(amount) AS total,
            SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END) AS cash,
            SUM(CASE WHEN payment_method='UPI' THEN amount ELSE 0 END) AS upi
     FROM payments WHERE status='COMPLETED' AND payment_date BETWEEN ? AND ? ${sc.sql} AND academic_year_id = ?
     GROUP BY payment_date ORDER BY payment_date`,
    sc.param ? [fromDate, toDate, sc.param, academicYearId] : [fromDate, toDate, academicYearId]
  );

  const [expenseList] = await pool.query(
    `SELECT e.id, e.amount, e.expense_type, e.payment_method, e.expense_date, e.description,
            c.name AS category_name, u.full_name AS created_by_name
     FROM expenses e
     JOIN expense_categories c ON c.id = e.category_id
     JOIN users u ON u.id = e.created_by
     WHERE e.status='ACTIVE' AND e.expense_date BETWEEN ? AND ? ${effectiveScope ? 'AND (e.expense_type = ? OR e.expense_type = \'BOTH\')' : ''} AND e.academic_year_id = ?
     ORDER BY e.expense_date DESC, e.id DESC`,
    effectiveScope ? [fromDate, toDate, effectiveScope, academicYearId] : [fromDate, toDate, academicYearId]
  );

  return {
    fromDate, toDate,
    collection,
    expenses: Number(expenses.total_expenses),
    expensesList: expenseList,
    netAmount: Number(collection.total_collection) - Number(expenses.total_expenses),
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
