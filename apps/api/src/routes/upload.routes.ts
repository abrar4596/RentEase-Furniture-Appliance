import { Router } from 'express';
import { uploadController } from '../controllers/upload.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

export const uploadRouter = Router();

uploadRouter.post('/signature', authenticate, uploadController.getUploadSignature);
