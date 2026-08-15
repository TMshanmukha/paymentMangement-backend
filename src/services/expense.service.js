import { pool } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { scopeForRole } from '../middleware/auth.js';

function assertTypeAllowed(scope, expenseType) {
  if (scope && scope !== expenseType) {
    throw ApiError.forbidden(
      `${scope === 'SCHOOL' ? 'School' : 'Tuition'} accountants can only manage ${scope.toLowerCase()} expenses`,
      'EXPENSE_TYPE_NOT_ALLOWED'
    );
  }
}

export async function listExpenses(user, query) {
  const scope = scopeForRole(user.role);
  const { date, fromDate, toDate, expenseType, categoryId, paymentMethod, academicYearId, page, pageSize } = query;

  const where = ["e.status = 'ACTIVE'"];
  const params = [];

  if (scope) {
    where.push('e.expense_type = ?');
    params.push(scope);
  } else if (expenseType) {
    where.push('e.expense_type = ?');
    params.push(expenseType);
  }
  if (date) { where.push('e.expense_date = ?'); params.push(date); }
  if (fromDate && toDate) { where.push('e.expense_date BETWEEN ? AND ?'); params.push(fromDate, toDate); }
  if (categoryId) { where.push('e.category_id = ?'); params.push(categoryId); }
  if (paymentMethod) { where.push('e.payment_method = ?'); params.push(paymentMethod); }
  if (academicYearId) { where.push('e.academic_year_id = ?'); params.push(academicYearId); }

  // Accountants (non-admin) may only see expenses they personally created
  if (scope) {
    where.push('e.created_by = ?');
    params.push(user.id);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT e.id, e.amount, e.expense_type, e.payment_method, e.expense_date, e.description,
            c.name AS category_name, u.full_name AS created_by_name
     FROM expenses e
     JOIN expense_categories c ON c.id = e.category_id
     JOIN users u ON u.id = e.created_by
     ${whereSql}
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM expenses e ${whereSql}`, params);
  const [sumRows] = await pool.query(`SELECT COALESCE(SUM(e.amount),0) AS total_amount FROM expenses e ${whereSql}`, params);

  return { items: rows, total: countRows[0].total, totalAmount: sumRows[0].total_amount, page, pageSize };
}

export async function createExpense(user, data) {
  const scope = scopeForRole(user.role);
  assertTypeAllowed(scope, data.expenseType);

  // Validate expense amount does not exceed total net collection for the academic year
  const [[{ totalCollection }]] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS totalCollection FROM payments WHERE status = 'COMPLETED' AND academic_year_id = ?",
    [data.academicYearId]
  );
  const [[{ totalExpenses }]] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS totalExpenses FROM expenses WHERE status = 'ACTIVE' AND academic_year_id = ?",
    [data.academicYearId]
  );
  const availableBalance = Number(totalCollection) - Number(totalExpenses);
  if (Number(data.amount) > availableBalance) {
    throw ApiError.badRequest(
      `Expense amount (₹${data.amount}) exceeds the remaining available net collection (₹${availableBalance})`,
      'EXPENSE_EXCEEDS_COLLECTION'
    );
  }

  let categoryId = null;
  if (data.categoryName) {
    const nameTrimmed = data.categoryName.trim();
    const [catRows] = await pool.query('SELECT id FROM expense_categories WHERE LOWER(name) = LOWER(?) LIMIT 1', [nameTrimmed]);
    if (catRows[0]) {
      categoryId = catRows[0].id;
    } else {
      const [insertCat] = await pool.query(
        "INSERT INTO expense_categories (name, expense_type, is_active) VALUES (?, 'BOTH', 1)",
        [nameTrimmed]
      );
      categoryId = insertCat.insertId;
    }
  } else {
    categoryId = data.categoryId;
  }

  const [result] = await pool.query(
    `INSERT INTO expenses (category_id, amount, expense_type, payment_method, expense_date, description, created_by, academic_year_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      categoryId,
      data.amount,
      data.expenseType,
      data.paymentMethod,
      data.expenseDate,
      data.description || null,
      user.id,
      data.academicYearId
    ]
  );

  await writeAudit({
    userId: user.id,
    action: 'EXPENSE_CREATED',
    entity: 'expense',
    entityId: result.insertId,
    description: `₹${data.amount} expense recorded (${data.expenseType})`,
  });

  const [rows] = await pool.query(
    `SELECT e.*, c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = ?`,
    [result.insertId]
  );
  return rows[0];
}

export async function updateExpense(user, id, data) {
  const [existingRows] = await pool.query('SELECT * FROM expenses WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Expense not found', 'EXPENSE_NOT_FOUND');

  const scope = scopeForRole(user.role);
  // Non-admins may only edit their own entries, and only within their domain
  if (scope) {
    assertTypeAllowed(scope, existing.expense_type);
    if (existing.created_by !== user.id) {
      throw ApiError.forbidden('You can only edit expenses you created', 'NOT_OWNER');
    }
  }
  if (data.expenseType) assertTypeAllowed(scope, data.expenseType);

  // If amount is updated, validate it does not exceed net collection
  if (data.amount !== undefined && Number(data.amount) !== Number(existing.amount)) {
    const academicYearId = existing.academic_year_id;
    const [[{ totalCollection }]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS totalCollection FROM payments WHERE status = 'COMPLETED' AND academic_year_id = ?",
      [academicYearId]
    );
    const [[{ totalExpenses }]] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS totalExpenses FROM expenses WHERE status = 'ACTIVE' AND academic_year_id = ?",
      [academicYearId]
    );
    const availableBalance = Number(totalCollection) - (Number(totalExpenses) - Number(existing.amount));
    if (Number(data.amount) > availableBalance) {
      throw ApiError.badRequest(
        `Updated expense amount (₹${data.amount}) exceeds the remaining available net collection (₹${availableBalance})`,
        'EXPENSE_EXCEEDS_COLLECTION'
      );
    }
  }

  const fields = [];
  const params = [];
  const map = {
    categoryId: 'category_id',
    amount: 'amount',
    expenseType: 'expense_type',
    paymentMethod: 'payment_method',
    expenseDate: 'expense_date',
    description: 'description',
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[key] === '' ? null : data[key]);
    }
  }
  if (fields.length === 0) return existing;
  params.push(id);
  await pool.query(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, params);

  await writeAudit({
    userId: user.id,
    action: 'EXPENSE_UPDATED',
    entity: 'expense',
    entityId: id,
    description: `Expense #${id} updated`,
  });

  const [rows] = await pool.query(
    `SELECT e.*, c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = ?`,
    [id]
  );
  return rows[0];
}

export async function listExpenseCategories() {
  const [rows] = await pool.query('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name');
  return rows;
}
