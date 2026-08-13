import { asyncHandler } from '../utils/asyncHandler.js';
import * as settingsService from '../services/settings.service.js';

export const getAll = asyncHandler(async (req, res) => {
  const data = await settingsService.getAllSettings();
  res.json({ success: true, data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await settingsService.updateSetting(req.body.key, req.body.value);
  res.json({ success: true, message: 'Settings updated', data });
});
