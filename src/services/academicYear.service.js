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
    if (data.isActive) {
      await conn.query('UPDATE academic_years SET is_active = 0');
    }
    const [result] = await conn.query(
      'INSERT INTO academic_years (year_name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)',
      [data.yearName, data.startDate, data.endDate, data.isActive ? 1 : 0]
    );
    if (data.isActive) {
      clearActiveYearCache();
    }
    const [rows] = await conn.query('SELECT * FROM academic_years WHERE id=?', [result.insertId]);
    return rows[0];
  });
}

export async function setCurrentAcademicYear(id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM academic_years WHERE id=?', [id]);
    if (!rows[0]) throw ApiError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
    await conn.query('UPDATE academic_years SET is_active = 0');
    await conn.query('UPDATE academic_years SET is_active = 1 WHERE id = ?', [id]);
    clearActiveYearCache();
    const [updated] = await conn.query('SELECT * FROM academic_years WHERE id=?', [id]);
    return updated[0];
  });
}
