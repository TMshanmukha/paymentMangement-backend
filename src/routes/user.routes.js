import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema, updateUserStatusSchema, resetPasswordSchema } from '../validators/user.validator.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/', userController.list);
router.post('/', validate(createUserSchema), userController.create);
router.put('/:id', validate(updateUserSchema), userController.update);
router.patch('/:id/status', validate(updateUserStatusSchema), userController.updateStatus);
router.post('/:id/reset-password', validate(resetPasswordSchema), userController.resetPassword);

export default router;
