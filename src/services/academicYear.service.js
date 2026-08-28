import { pool, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { clearActiveYearCache } from '../middleware/academicYear.js';

export async function listAcademicYears() {
  const [rows] = await pool.query('SELECT * FROM academic_years ORDER BY start_date DESC');
  return rows;
}

export async function getCurrentAcademicYear() {
  const [rows] = await pool.query('SELECT * FROM academic_years WHERE is_active = 1 LIMIT 1');
  return rows[0];
}

export async function createAcademicYear(data) {
  return withTransaction(async (conn) => {
    let previousActiveYearId = null;
    if (data.isActive) {
      const [activeRows] = await conn.query('SELECT id FROM academic_years WHERE is_active = 1 LIMIT 1');
      previousActiveYearId = activeRows[0]?.id;
      await conn.query('UPDATE academic_years SET is_active = 0');
    }
    const [result] = await conn.query(
      'INSERT INTO academic_years (year_name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)',
      [data.yearName, data.startDate, data.endDate, data.isActive ? 1 : 0]
    );
    const newYearId = result.insertId;
    if (data.isActive) {
      clearActiveYearCache();
      await rolloverStudents(conn, previousActiveYearId, newYearId);
    }
    const [rows] = await conn.query('SELECT * FROM academic_years WHERE id=?', [newYearId]);
    return rows[0];
  });
}

export async function setCurrentAcademicYear(id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM academic_years WHERE id=?', [id]);
    if (!rows[0]) throw ApiError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
    
    const [activeRows] = await conn.query('SELECT id FROM academic_years WHERE is_active = 1 LIMIT 1');
    const previousActiveYearId = activeRows[0]?.id;

    await conn.query('UPDATE academic_years SET is_active = 0');
    await conn.query('UPDATE academic_years SET is_active = 1 WHERE id = ?', [id]);
    clearActiveYearCache();

    await rolloverStudents(conn, previousActiveYearId, id);

    const [updated] = await conn.query('SELECT * FROM academic_years WHERE id=?', [id]);
    return updated[0];
  });
}

async function rolloverStudents(conn, previousYearId, newYearId) {
  if (!previousYearId || !newYearId || previousYearId === newYearId) return;

  const [existing] = await conn.query('SELECT 1 FROM students WHERE academic_year_id = ? LIMIT 1', [newYearId]);
  if (existing.length > 0) return;

  const [activeStudents] = await conn.query(
    `SELECT student_code, name, parent_name, parent_phone, student_phone, class, section,
            student_type, admission_type, address, status, created_by
     FROM students
     WHERE academic_year_id = ? AND status = 'ACTIVE'`,
    [previousYearId]
  );

  for (const s of activeStudents) {
    await conn.query(
      `INSERT INTO students
         (student_code, name, parent_name, parent_phone, student_phone, class, section,
          student_type, admission_type, academic_year_id, total_fee, joining_date, address, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, CURDATE(), ?, ?, ?)`,
      [
        s.student_code,
        s.name,
        s.parent_name,
        s.parent_phone,
        s.student_phone,
        s.class,
        s.section,
        s.student_type,
        s.admission_type,
        newYearId,
        s.address,
        s.status,
        s.created_by
      ]
    );
  }
}
