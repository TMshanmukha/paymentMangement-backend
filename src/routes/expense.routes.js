import { Router } from 'express';
import * as expenseController from '../controllers/expense.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createExpenseSchema, updateExpenseSchema, listExpensesQuerySchema } from '../validators/expense.validator.js';

const router = Router();
router.use(authenticate);
const ALL_STAFF = ['ADMIN', 'SCHOOL_ACCOUNTANT', 'TUITION_ACCOUNTANT'];

router.get('/categories', authorize(...ALL_STAFF), expenseController.categories);
router.get('/', authorize(...ALL_STAFF), validate(listExpensesQuerySchema, 'query'), expenseController.list);
router.post('/', authorize(...ALL_STAFF), validate(createExpenseSchema), expenseController.create);
router.put('/:id', authorize(...ALL_STAFF), validate(updateExpenseSchema), expenseController.update);

export default router;
