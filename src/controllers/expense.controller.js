import { asyncHandler } from '../utils/asyncHandler.js';
import * as expenseService from '../services/expense.service.js';

export const list = asyncHandler(async (req, res) => {
  req.query.academicYearId = req.academicYearId;
  const result = await expenseService.listExpenses(req.user, req.query);
  res.json({ success: true, data: result });
});

export const create = asyncHandler(async (req, res) => {
  req.body.academicYearId = req.academicYearId;
  const expense = await expenseService.createExpense(req.user, req.body);
  res.status(201).json({ success: true, message: 'Expense added successfully', data: expense });
});

export const update = asyncHandler(async (req, res) => {
  const expense = await expenseService.updateExpense(req.user, req.params.id, req.body);
  res.json({ success: true, message: 'Expense updated successfully', data: expense });
});

export const categories = asyncHandler(async (req, res) => {
  const cats = await expenseService.listExpenseCategories();
  res.json({ success: true, data: cats });
});
