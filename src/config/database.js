import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const poolConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Use TiDB TLS when DB_SSL is enabled
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = {
    ca: fs.readFileSync(
      path.join(__dirname, '../../certs/ca.pem')
    ),
    rejectUnauthorized: true,
  };
}

export const pool = mysql.createPool(poolConfig);

export async function testDatabaseConnection() {
  let connection;

  try {
    connection = await pool.getConnection();

    await connection.query('SELECT 1');

    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}