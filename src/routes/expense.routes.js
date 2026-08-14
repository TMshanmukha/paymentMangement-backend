import { Router } from 'express';
import * as expenseController from '../controllers/expense.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createExpenseSchema, updateExpenseSchema, listExpensesQuerySchema } from '../validators/expense.validator.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/categories', expenseController.categories);
router.get('/', validate(listExpensesQuerySchema, 'query'), expenseController.list);
router.post('/', validate(createExpenseSchema), expenseController.create);
router.put('/:id', validate(updateExpenseSchema), expenseController.update);

export default router;
