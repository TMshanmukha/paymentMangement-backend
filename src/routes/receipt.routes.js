import { Router } from 'express';
import * as receiptController from '../controllers/receipt.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.get('/:id', authorize('ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'), receiptController.getReceipt);

export default router;
