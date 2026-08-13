import { pool, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';

export async function listAcademicYears() {
  const [rows] = await pool.query('SELECT * FROM academic_years ORDER BY start_date DESC');
  return rows;
}

export async function createAcademicYear(data) {
  return withTransaction(async (conn) => {
    if (data.isCurrent) {
      await conn.query('UPDATE academic_years SET is_current = 0');
    }
    const [result] = await conn.query(
      'INSERT INTO academic_years (year_label, start_date, end_date, is_current) VALUES (?, ?, ?, ?)',
      [data.yearLabel, data.startDate, data.endDate, data.isCurrent ? 1 : 0]
    );
    const [rows] = await conn.query('SELECT * FROM academic_years WHERE id=?', [result.insertId]);
    return rows[0];
  });
}

export async function setCurrentAcademicYear(id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM academic_years WHERE id=?', [id]);
    if (!rows[0]) throw ApiError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
    await conn.query('UPDATE academic_years SET is_current = 0');
    await conn.query('UPDATE academic_years SET is_current = 1 WHERE id = ?', [id]);
    const [updated] = await conn.query('SELECT * FROM academic_years WHERE id=?', [id]);
    return updated[0];
  });
}
