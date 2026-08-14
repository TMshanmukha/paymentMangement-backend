import { Router } from 'express';
import * as academicYearController from '../controllers/academicYear.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.get('/', academicYearController.list); // all staff need this for dropdowns
router.get('/current', academicYearController.getCurrent);
router.post('/', authorize('ADMIN'), academicYearController.create);
router.patch('/:id/set-current', authorize('ADMIN'), academicYearController.setCurrent);
router.patch('/:id/activate', authorize('ADMIN'), academicYearController.setCurrent);

export default router;
