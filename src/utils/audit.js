import { pool } from '../db/pool.js';

function getIndiaDateTimeString() {
  const d = new Date();
  const tzString = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzString);
  const yyyy = localDate.getFullYear();
  const mm = String(localDate.getMonth() + 1).padStart(2, '0');
  const dd = String(localDate.getDate()).padStart(2, '0');
  const hh = String(localDate.getHours()).padStart(2, '0');
  const min = String(localDate.getMinutes()).padStart(2, '0');
  const ss = String(localDate.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Writes a row to audit_logs. Accepts an optional existing connection
 * (`conn`) so it can participate in the same transaction as the action
 * it is recording (e.g. payment creation) — pass `pool` implicitly by
 * omitting `conn` for standalone actions like login/logout.
 */
export async function writeAudit({ conn, userId, action, entity, entityId, description, ip, metadata }) {
  const executor = conn || pool;
  const indiaTime = getIndiaDateTimeString();

  await executor.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, description, ip_address, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      action,
      entity,
      entityId ?? null,
      description ?? null,
      ip ?? null,
      metadata ? JSON.stringify(metadata) : null,
      indiaTime,
    ]
  );
}
