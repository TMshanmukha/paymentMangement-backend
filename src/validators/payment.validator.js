import { z } from 'zod';

export const createPaymentSchema = z.object({
  studentId: z.coerce.number().int().positive('Student is required'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  paymentMethod: z.enum(['CASH', 'UPI']),
  paymentDate: z.string().min(1, 'Payment date is required'),
  remarks: z.string().max(255).optional().or(z.literal('')),
  clientRequestId: z.string().optional(),
});

export const cancelPaymentSchema = z.object({
  reason: z.string().min(3, 'Please provide a reason'),
});

export const listPaymentsQuerySchema = z.object({
  date: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  studentType: z.enum(['SCHOOL', 'TUITION']).optional(),
  paymentMethod: z.enum(['CASH', 'UPI']).optional(),
  receivedBy: z.coerce.number().int().positive().optional(),
  status: z.enum(['COMPLETED', 'CANCELLED', 'REVERSED']).optional(),
  search: z.string().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(20),
});
