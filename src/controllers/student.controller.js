import { asyncHandler } from '../utils/asyncHandler.js';
import * as studentService from '../services/student.service.js';

export const list = asyncHandler(async (req, res) => {
  req.query.academicYearId = req.academicYearId;
  const result = await studentService.listStudents(req.user, req.query);
  res.json({ success: true, data: result });
});

export const listClasses = asyncHandler(async (req, res) => {
  const result = await studentService.listClasses(req.user, req.academicYearId, req.query.studentType);
  res.json({ success: true, data: result });
});

export const getOne = asyncHandler(async (req, res) => {
  const student = await studentService.getStudentById(req.user, req.params.id);
  res.json({ success: true, data: student });
});

export const paymentHistory = asyncHandler(async (req, res) => {
  const history = await studentService.getStudentPaymentHistory(req.user, req.params.id);
  res.json({ success: true, data: history });
});

export const create = asyncHandler(async (req, res) => {
  req.body.academicYearId = req.academicYearId;
  const student = await studentService.createStudent(req.user, req.body);
  res.status(201).json({ success: true, message: 'Student added successfully', data: student });
});

export const update = asyncHandler(async (req, res) => {
  const student = await studentService.updateStudent(req.user, req.params.id, req.body);
  res.json({ success: true, message: 'Student updated successfully', data: student });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const student = await studentService.updateStudentStatus(req.user, req.params.id, req.body.status);
  res.json({ success: true, message: 'Student status updated', data: student });
});
