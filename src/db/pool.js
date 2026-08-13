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
  poolConfig.ssl = {
    ca: fs.readFileSync(
      path.join(__dirname, '../../certs/ca.pem')
    ),
    rejectUnauthorized: true,
  };
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