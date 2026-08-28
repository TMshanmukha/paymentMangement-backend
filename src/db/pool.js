import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const poolConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  decimalNumbers: true,
  dateStrings: true,
};

// Enable TLS for TiDB Cloud
if (process.env.DB_SSL === 'true') {
  const caPath = path.join(__dirname, '../../certs/ca.pem');
  poolConfig.ssl = {
    rejectUnauthorized: true,
  };
  if (fs.existsSync(caPath)) {
    poolConfig.ssl.ca = fs.readFileSync(caPath);
  }
}

export const pool = mysql.createPool(poolConfig);

/**
 * Run a callback inside a MySQL transaction with a dedicated connection.
 * Automatically commits on success and rolls back on any thrown error.
 */
export async function withTransaction(callback) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const result = await callback(conn);

    await conn.commit();

    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Run database schema migration for student index
(async () => {
  try {
    const [indexes] = await pool.query("SHOW INDEX FROM students WHERE Key_name = 'student_code'");
    if (indexes.length > 0) {
      console.log('[db] Migrating students table constraints for academic year support...');
      const conn = await pool.getConnection();
      try {
        await conn.query('ALTER TABLE students DROP INDEX student_code');
        await conn.query('ALTER TABLE students ADD UNIQUE KEY idx_student_code_year (student_code, academic_year_id)');
        console.log('[db] Constraint migration completed successfully.');
      } catch (e) {
        console.error('[db] Constraint migration error:', e.message);
      } finally {
        conn.release();
      }
    }
  } catch (err) {
    console.error('[db] Index check failed:', err);
  }
})();