import { asyncHandler } from '../utils/asyncHandler.js';
import * as reportService from '../services/report.service.js';
import { ApiError } from '../utils/ApiError.js';

export const dashboard = asyncHandler(async (req, res) => {
  const data = await reportService.getDashboardSummary(req.user, req.academicYearId);
  res.json({ success: true, data });
});

export const daily = asyncHandler(async (req, res) => {
  const data = await reportService.getDailyReport(req.user, req.query.date, req.academicYearId);
  res.json({ success: true, data });
});

export const monthly = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const data = await reportService.getMonthlyReport(req.user, year, month, req.academicYearId);
  res.json({ success: true, data });
});

export const dateRange = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;
  if (!fromDate || !toDate) throw ApiError.badRequest('fromDate and toDate are required', 'MISSING_DATE_RANGE');
  const data = await reportService.getDateRangeReport(req.user, fromDate, toDate, req.academicYearId);
  res.json({ success: true, data });
});

export const accountant = asyncHandler(async (req, res) => {
  const { accountantId, fromDate, toDate } = req.query;
  if (!fromDate || !toDate) throw ApiError.badRequest('fromDate and toDate are required', 'MISSING_DATE_RANGE');
  const data = await reportService.getAccountantReport(req.user, Number(accountantId) || null, fromDate, toDate, req.academicYearId);
  res.json({ success: true, data });
});

export const due = asyncHandler(async (req, res) => {
  req.query.academicYearId = req.academicYearId;
  const data = await reportService.getDueReport(req.user, req.query);
  res.json({ success: true, data });
});
