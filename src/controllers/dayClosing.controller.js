import { asyncHandler } from '../utils/asyncHandler.js';
import * as dayClosingService from '../services/dayClosing.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await dayClosingService.listDayClosings(req.user, req.query, req.academicYearId);
  res.json({ success: true, data });
});

export const expected = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const data = await dayClosingService.getExpectedCollection(req.user.id, date, req.academicYearId);
  res.json({ success: true, data });
});

export const submit = asyncHandler(async (req, res) => {
  const data = await dayClosingService.submitDayClosing(req.user, req.body, req.academicYearId);
  res.status(201).json({ success: true, message: 'Day closing submitted', data });
});

export const approve = asyncHandler(async (req, res) => {
  const data = await dayClosingService.approveDayClosing(req.user, req.params.id);
  res.json({ success: true, message: 'Day closing approved', data });
});

export const reopen = asyncHandler(async (req, res) => {
  const data = await dayClosingService.reopenDayClosing(req.user, req.params.id, req.body.reason);
  res.json({ success: true, message: 'Day closing reopened', data });
});
