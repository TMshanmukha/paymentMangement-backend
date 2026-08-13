import { pool } from '../db/pool.js';

export async function getAllSettings() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM app_settings');
  return rows.reduce((acc, r) => ({ ...acc, [r.setting_key]: r.setting_value }), {});
}

export async function updateSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
  return getAllSettings();
}
