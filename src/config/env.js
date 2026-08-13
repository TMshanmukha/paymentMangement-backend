import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const val = process.env[name] ?? fallback;

  if (val === undefined) {
    console.warn(`[env] Missing environment variable: ${name}`);
  }

  return val;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),

  DB_HOST: required('DB_HOST', 'localhost'),
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_NAME: required('DB_NAME', 'eduledger'),
  DB_USER: required('DB_USER', 'root'),
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  JWT_SECRET: required('JWT_SECRET', 'dev-only-change-me'),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
  JWT_REFRESH_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,

  COOKIE_SECRET: required(
    'COOKIE_SECRET',
    'dev-only-change-me-too'
  ),

  CORS_ORIGIN:
    process.env.CORS_ORIGIN || 'http://localhost:5173',
};