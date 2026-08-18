import { z } from 'zod';

const phoneRegex = /^[0-9+\-\s]{7,20}$/;

export const createStudentSchema = z.object({
  name: z.string().min(2, 'Student name is required'),
  parentName: z.string().min(2, 'Parent name is required'),
  parentPhone: z.string().regex(phoneRegex, 'Enter a valid phone number'),
  studentPhone: z.string().regex(phoneRegex).optional().or(z.literal('')).optional(),
  class: z.string().optional().or(z.literal('')),
  section: z.string().optional().or(z.literal('')),
  studentType: z.enum(['SCHOOL', 'TUITION']),
  admissionType: z.enum(['REGULAR', 'SCHOLARSHIP']).optional().default('REGULAR'),
  academicYearId: z.coerce.number().int().positive('Academic year is required').optional(),
  totalFee: z.coerce.number().min(0, 'Total fee cannot be negative'),
  joiningDate: z.string().min(1, 'Joining date is required'),
  address: z.string().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
});

export const updateStudentSchema = createStudentSchema.partial();

export const updateStudentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const listStudentsQuerySchema = z.object({
  studentType: z.enum(['SCHOOL', 'TUITION']).optional(),
  admissionType: z.enum(['REGULAR', 'SCHOLARSHIP']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  dueOnly: z.coerce.boolean().optional(),
  class: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).optional().default(20),
});
