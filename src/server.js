import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';

async function start() {
  try {
    // Fail fast with a clear message if the DB isn't reachable, rather than
    // starting a server that will error on every request.
    const conn = await pool.getConnection();
    conn.release();
    // eslint-disable-next-line no-console
    console.log('[db] Connected to MySQL successfully');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] Failed to connect to MySQL:', err.message);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] EduLedger API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

start();
