import { Router } from 'express';
import {
  createVendorProfileSchema,
  updateVendorProfileSchema,
  adminVerifyVendorSchema,
  adminUpdateVendorCommissionSchema,
  USER_ROLES,
} from '@rentease/shared';
import { vendorController } from '../controllers/vendor.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';

export const vendorRouter = Router();

// Vendor Self Management
vendorRouter.get('/me', authenticate, authorize(USER_ROLES.VENDOR), vendorController.getMyProfile);

vendorRouter.post(
  '/profile',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  validate({ body: createVendorProfileSchema }),
  vendorController.createProfile
);

vendorRouter.patch(
  '/profile',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  validate({ body: updateVendorProfileSchema }),
  vendorController.updateProfile
);

// Admin Vendor Verification Queue
vendorRouter.get(
  '/admin/all',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  vendorController.adminListVendors
);

vendorRouter.patch(
  '/admin/:id/verify',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  validate({ body: adminVerifyVendorSchema }),
  vendorController.adminVerifyVendor
);

vendorRouter.patch(
  '/admin/:id/commission',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  validate({ body: adminUpdateVendorCommissionSchema }),
  vendorController.adminUpdateCommission
);
