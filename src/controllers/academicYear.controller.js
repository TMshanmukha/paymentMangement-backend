import { asyncHandler } from '../utils/asyncHandler.js';
import * as academicYearService from '../services/academicYear.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await academicYearService.listAcademicYears();
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await academicYearService.createAcademicYear(req.body);
  res.status(201).json({ success: true, message: 'Academic year created', data });
});

export const setCurrent = asyncHandler(async (req, res) => {
  const data = await academicYearService.setCurrentAcademicYear(req.params.id);
  res.json({ success: true, message: 'Current academic year updated', data });
});
