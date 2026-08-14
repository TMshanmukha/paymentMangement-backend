import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE_NAME = 'eduledger_refresh';
const isProduction = env.NODE_ENV === 'production';
const useSecureCookie = isProduction || env.CORS_ORIGIN.startsWith('https://');

const cookieOptions = {
  httpOnly: true,
  secure: useSecureCookie,
  sameSite: useSecureCookie ? 'none' : 'lax',
  maxAge: env.JWT_REFRESH_EXPIRY_MS,
  path: '/api/auth',
};

export const login = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.login(req.body, req.ip);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
  res.json({ success: true, message: 'Login successful', data: { accessToken, user } });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  const { accessToken, refreshToken } = await authService.refreshAccessToken(token);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
  res.json({ success: true, data: { accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user?.id, req.ip);
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ success: true, data: user });
});
