import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : null,
  });

  try {
    console.log("Querying all payments in database:");
    const [payments] = await pool.query("SELECT id, amount, payment_date, status, payment_method, student_type FROM payments");
    console.log("Payments:", payments);

    console.log("\nQuerying chart raw query:");
    const [chartRows] = await pool.query(
      `SELECT DATE_FORMAT(payment_date, '%b %y') AS month_label,
               SUM(CASE WHEN student_type='SCHOOL' THEN amount ELSE 0 END) AS school,
               SUM(CASE WHEN student_type='TUITION' THEN amount ELSE 0 END) AS tuition,
               SUM(amount) AS total,
               MIN(payment_date) AS sort_date
       FROM payments
       WHERE status='COMPLETED'
       GROUP BY DATE_FORMAT(payment_date, '%b %y')
       ORDER BY sort_date ASC`
    );
    console.log("Chart Rows:", chartRows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();
