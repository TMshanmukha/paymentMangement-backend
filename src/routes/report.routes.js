import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
const ALL_STAFF = ['ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'];

router.get('/dashboard', authorize(...ALL_STAFF), reportController.dashboard);
router.get('/daily', authorize(...ALL_STAFF), reportController.daily);
router.get('/monthly', authorize(...ALL_STAFF), reportController.monthly);
router.get('/date-range', authorize(...ALL_STAFF), reportController.dateRange);
router.get('/accountant', authorize(...ALL_STAFF), reportController.accountant);
router.get('/due', authorize(...ALL_STAFF), reportController.due);

export default router;
