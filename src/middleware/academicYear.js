import { pool } from '../db/pool.js';

let activeYearId = null;

export async function getActiveYearId() {
  if (activeYearId !== null) return activeYearId;
  const [rows] = await pool.query('SELECT id FROM academic_years WHERE is_active = 1 LIMIT 1');
  if (rows[0]) {
    activeYearId = rows[0].id;
  }
  return activeYearId;
}

export function clearActiveYearCache() {
  activeYearId = null;
}

export async function academicYear(req, res, next) {
  try {
    const headerId = req.headers['x-academic-year-id'];
    if (headerId) {
      req.academicYearId = Number(headerId);
    } else {
      req.academicYearId = await getActiveYearId();
    }
    next();
  } catch (err) {
    next(err);
  }
}
