import { z } from 'zod';

export const createExpenseSchema = z.object({
  categoryId: z.coerce.number().int().positive('Category is required'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  expenseType: z.enum(['SCHOOL', 'TUITION']),
  paymentMethod: z.enum(['CASH', 'UPI']),
  expenseDate: z.string().min(1, 'Expense date is required'),
  description: z.string().max(255).optional().or(z.literal('')),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = z.object({
  date: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  expenseType: z.enum(['SCHOOL', 'TUITION']).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  paymentMethod: z.enum(['CASH', 'UPI']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(20),
});
