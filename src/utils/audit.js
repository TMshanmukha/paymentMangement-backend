import { pool } from '../db/pool.js';

/**
 * Writes a row to audit_logs. Accepts an optional existing connection
 * (`conn`) so it can participate in the same transaction as the action
 * it is recording (e.g. payment creation) — pass `pool` implicitly by
 * omitting `conn` for standalone actions like login/logout.
 */
export async function writeAudit({ conn, userId, action, entity, entityId, description, ip, metadata }) {
  const executor = conn || pool;
  await executor.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, description, ip_address, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      action,
      entity,
      entityId ?? null,
      description ?? null,
      ip ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}
