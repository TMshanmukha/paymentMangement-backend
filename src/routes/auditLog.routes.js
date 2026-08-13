import { Router } from 'express';
import * as auditLogController from '../controllers/auditLog.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));
router.get('/', auditLogController.list);

export default router;
