import { Router } from 'express';
import authRoutes from './auth.routes.js';
import studentRoutes from './student.routes.js';
import paymentRoutes from './payment.routes.js';
import receiptRoutes from './receipt.routes.js';
import expenseRoutes from './expense.routes.js';
import reportRoutes from './report.routes.js';
import dayClosingRoutes from './dayClosing.routes.js';
import userRoutes from './user.routes.js';
import auditLogRoutes from './auditLog.routes.js';
import academicYearRoutes from './academicYear.routes.js';
import settingsRoutes from './settings.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/payments', paymentRoutes);
router.use('/receipts', receiptRoutes);
router.use('/expenses', expenseRoutes);
router.use('/reports', reportRoutes);
router.use('/day-closings', dayClosingRoutes);
router.use('/users', userRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/academic-years', academicYearRoutes);
router.use('/settings', settingsRoutes);

router.get('/health', (req, res) => res.json({ success: true, message: 'EduLedger API is running' }));

export default router;
