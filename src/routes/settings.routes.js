import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.get('/', settingsController.getAll); // public access for brand name & settings
router.put('/', authenticate, authorize('ADMIN'), settingsController.update);

export default router;
