import { z } from 'zod';

export const submitDayClosingSchema = z.object({
  closingDate: z.string().min(1, 'Date is required'),
  notes: z.string().max(255).optional().or(z.literal('')),
});

export const reopenDayClosingSchema = z.object({
  reason: z.string().min(3, 'Please provide a reason for reopening'),
});
