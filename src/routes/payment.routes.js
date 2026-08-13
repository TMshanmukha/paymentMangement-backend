import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createPaymentSchema, cancelPaymentSchema, listPaymentsQuerySchema } from '../validators/payment.validator.js';

const router = Router();
router.use(authenticate);
const ALL_STAFF = ['ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'];

router.get('/', authorize(...ALL_STAFF), validate(listPaymentsQuerySchema, 'query'), paymentController.list);
router.get('/:id', authorize(...ALL_STAFF), paymentController.getOne);
router.post('/', authorize(...ALL_STAFF), validate(createPaymentSchema), paymentController.create);
router.post('/:id/cancel', authorize('ADMIN'), validate(cancelPaymentSchema), paymentController.cancel);
router.post('/:id/reverse', authorize('ADMIN'), validate(cancelPaymentSchema), paymentController.reverse);

export default router;
