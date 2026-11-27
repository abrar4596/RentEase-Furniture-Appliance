import { Router } from 'express';
import { uploadController } from '../controllers/upload.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { USER_ROLES } from '@rentease/shared';

export const uploadRouter = Router();

uploadRouter.post('/signature', authenticate, uploadController.getUploadSignature);

// Admin-only: get a short-lived authenticated URL for viewing a private KYC document.
uploadRouter.get(
  '/kyc-view-url',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  uploadController.getKycViewUrl
);
