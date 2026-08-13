import { Router } from 'express';
import * as dayClosingController from '../controllers/dayClosing.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { submitDayClosingSchema, reopenDayClosingSchema } from '../validators/dayClosing.validator.js';

const router = Router();
router.use(authenticate);
const ALL_STAFF = ['ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'];

router.get('/', authorize(...ALL_STAFF), dayClosingController.list);
router.get('/expected', authorize(...ALL_STAFF), dayClosingController.expected);
router.post('/', authorize(...ALL_STAFF), validate(submitDayClosingSchema), dayClosingController.submit);
router.post('/:id/approve', authorize('ADMIN'), dayClosingController.approve);
router.post('/:id/reopen', authorize('ADMIN'), validate(reopenDayClosingSchema), dayClosingController.reopen);

export default router;
