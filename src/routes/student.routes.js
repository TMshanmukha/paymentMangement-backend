import { Router } from 'express';
import * as studentController from '../controllers/student.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createStudentSchema, updateStudentSchema, updateStudentStatusSchema, listStudentsQuerySchema,
} from '../validators/student.validator.js';

const router = Router();
router.use(authenticate);

const ALL_STAFF = ['ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'];

router.get('/', authorize(...ALL_STAFF), validate(listStudentsQuerySchema, 'query'), studentController.list);
router.get('/classes', authorize(...ALL_STAFF), studentController.listClasses);
router.get('/:id', authorize(...ALL_STAFF), studentController.getOne);
router.get('/:id/payments', authorize(...ALL_STAFF), studentController.paymentHistory);
router.post('/', authorize(...ALL_STAFF), validate(createStudentSchema), studentController.create);
router.put('/:id', authorize(...ALL_STAFF), validate(updateStudentSchema), studentController.update);
router.patch('/:id/status', authorize(...ALL_STAFF), validate(updateStudentStatusSchema), studentController.updateStatus);

export default router;
