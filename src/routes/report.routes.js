import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
const ALL_STAFF = ['ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'];

router.get('/dashboard', authorize(...ALL_STAFF), reportController.dashboard);
router.get('/daily', authorize('ADMIN'), reportController.daily);
router.get('/monthly', authorize('ADMIN'), reportController.monthly);
router.get('/date-range', authorize('ADMIN'), reportController.dateRange);
router.get('/accountant', authorize('ADMIN'), reportController.accountant);
router.get('/due', authorize('ADMIN'), reportController.due);

export default router;
