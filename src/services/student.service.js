import { pool, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { scopeForRole } from '../middleware/auth.js';

/**
 * Enforces that an accountant may only touch students of their own type.
 * Admin (scope === null) is unrestricted.
 */
function assertTypeAllowed(scope, studentType) {
  if (scope && scope !== studentType) {
    throw ApiError.forbidden(
      `${scope === 'SCHOOL' ? 'School' : 'Tuition'} accountants cannot manage ${studentType.toLowerCase()} students`,
      'STUDENT_TYPE_NOT_ALLOWED'
    );
  }
}

export async function listStudents(user, query) {
  const scope = scopeForRole(user.role);
  const { studentType, status, academicYearId, search, dueOnly, page, pageSize } = query;
  const className = query.class;

  const where = [];
  const params = [];

  if (scope) {
    where.push('student_type = ?');
    params.push(scope);
  } else if (studentType) {
    where.push('student_type = ?');
    params.push(studentType);
  }

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (academicYearId) {
    where.push('academic_year_id = ?');
    params.push(academicYearId);
  }
  if (search) {
    where.push('(name LIKE ? OR parent_name LIKE ? OR student_code LIKE ? OR parent_phone LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (dueOnly) {
    where.push('student_id IN (SELECT student_id FROM v_student_dues WHERE due_amount > 0)');
  }
  if (className !== undefined) {
    if (className === '' || className === 'null') {
      where.push('(class IS NULL OR class = "")');
    } else {
      where.push('class = ?');
      params.push(className);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT d.* FROM v_student_dues d ${whereSql.replace(/student_id/g, 'd.student_id')}
     ORDER BY d.student_id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM v_student_dues d ${whereSql.replace(/student_id/g, 'd.student_id')}`,
    params
  );

  return { items: rows, total: countRows[0].total, page, pageSize };
}

export async function getStudentById(user, id) {
  const scope = scopeForRole(user.role);
  const [rows] = await pool.query('SELECT * FROM v_student_dues WHERE student_id = ? LIMIT 1', [id]);
  const student = rows[0];
  if (!student) throw ApiError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  assertTypeAllowed(scope, student.student_type);
  return student;
}

export async function getStudentPaymentHistory(user, id) {
  await getStudentById(user, id); // also enforces scope + existence
  const [rows] = await pool.query(
    `SELECT p.id, p.receipt_number, p.amount, p.payment_method, p.payment_date, p.payment_time,
            p.status, u.full_name AS received_by_name
     FROM payments p JOIN users u ON u.id = p.received_by
     WHERE p.student_id = ? ORDER BY p.payment_date DESC, p.payment_time DESC`,
    [id]
  );
  return rows;
}

export async function createStudent(user, data) {
  const scope = scopeForRole(user.role);
  assertTypeAllowed(scope, data.studentType);

  const tempCode = 'TEMP-' + Math.random().toString(36).substring(2, 10);

  return withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO students
         (student_code, name, parent_name, parent_phone, student_phone, class, section,
          student_type, academic_year_id, total_fee, joining_date, address, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tempCode,
        data.name,
        data.parentName,
        data.parentPhone,
        data.studentPhone || null,
        data.class || null,
        data.section || null,
        data.studentType,
        data.academicYearId,
        data.totalFee,
        data.joiningDate,
        data.address || null,
        data.status || 'ACTIVE',
        user.id,
      ]
    );

    const insertId = result.insertId;
    const studentCode = `STU-${String(insertId).padStart(6, '0')}`;

    await conn.query(
      'UPDATE students SET student_code = ? WHERE id = ?',
      [studentCode, insertId]
    );

    await writeAudit({
      conn,
      userId: user.id,
      action: 'STUDENT_CREATED',
      entity: 'student',
      entityId: insertId,
      description: `${data.name} added as ${data.studentType} student`,
    });

    const [studentRows] = await conn.query('SELECT * FROM v_student_dues WHERE student_id = ? LIMIT 1', [insertId]);
    return studentRows[0];
  });
}

export async function updateStudent(user, id, data) {
  const existing = await getStudentById(user, id);
  const scope = scopeForRole(user.role);
  if (data.studentType) assertTypeAllowed(scope, data.studentType);

  const fields = [];
  const params = [];
  const map = {
    name: 'name',
    parentName: 'parent_name',
    parentPhone: 'parent_phone',
    studentPhone: 'student_phone',
    class: 'class',
    section: 'section',
    studentType: 'student_type',
    academicYearId: 'academic_year_id',
    totalFee: 'total_fee',
    joiningDate: 'joining_date',
    address: 'address',
    status: 'status',
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[key] === '' ? null : data[key]);
    }
  }
  if (fields.length === 0) return existing;

  params.push(id);
  await pool.query(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`, params);

  await writeAudit({
    userId: user.id,
    action: 'STUDENT_UPDATED',
    entity: 'student',
    entityId: id,
    description: `Student #${id} updated`,
  });

  return getStudentById(user, id);
}

export async function updateStudentStatus(user, id, status) {
  await getStudentById(user, id);
  await pool.query('UPDATE students SET status = ? WHERE id = ?', [status, id]);
  await writeAudit({
    userId: user.id,
    action: status === 'INACTIVE' ? 'STUDENT_DEACTIVATED' : 'STUDENT_ACTIVATED',
    entity: 'student',
    entityId: id,
    description: `Student #${id} status changed to ${status}`,
  });
  return getStudentById(user, id);
}

export async function listClasses(user, academicYearId, studentType = null) {
  const scope = scopeForRole(user.role);
  const params = [];
  let sql = `
    SELECT
      class,
      COUNT(*) AS student_count,
      SUM(total_fee) AS total_fee,
      SUM(paid_amount) AS paid_amount,
      SUM(due_amount) AS due_amount
    FROM v_student_dues
  `;
  const conditions = [];
  if (scope) {
    conditions.push('student_type = ?');
    params.push(scope);
  } else if (studentType) {
    conditions.push('student_type = ?');
    params.push(studentType);
  }
  if (academicYearId) {
    conditions.push('academic_year_id = ?');
    params.push(academicYearId);
  }
  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' GROUP BY class';
  const [rows] = await pool.query(sql, params);

  const STANDARD_CLASSES = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const dbClassMap = new Map(
    rows.map(r => [String(r.class || '').toLowerCase().trim(), r])
  );

  const finalClasses = [];
  const seen = new Set();

  for (const stdClass of STANDARD_CLASSES) {
    const key = stdClass.toLowerCase();
    seen.add(key);
    if (dbClassMap.has(key)) {
      const record = dbClassMap.get(key);
      finalClasses.push({
        ...record,
        class: stdClass
      });
    } else {
      finalClasses.push({
        class: stdClass,
        student_count: 0,
        total_fee: 0.0,
        paid_amount: 0.0,
        due_amount: 0.0
      });
    }
  }

  // Also include any non-standard class that has students currently
  for (const row of rows) {
    const className = row.class;
    if (className === null || className === '') continue;
    const key = String(className).toLowerCase().trim();
    if (!seen.has(key)) {
      finalClasses.push(row);
    }
  }

  // Handle unassigned students separately if any exist in DB
  if (dbClassMap.has('')) {
    finalClasses.push(dbClassMap.get(''));
  }

  return finalClasses;
}
