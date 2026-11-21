import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { markVendorPayoutSchema, USER_ROLES } from '@rentease/shared';
import { payoutController } from '../controllers/payout.controller.js';

export const payoutRouter = Router();

payoutRouter.get('/ledger', authenticate, authorize(USER_ROLES.VENDOR), payoutController.getVendor);
payoutRouter.get(
  '/admin/ledger',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  payoutController.listAdmin
);
payoutRouter.patch(
  '/admin/pay',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  validate({ body: markVendorPayoutSchema }),
  payoutController.markPaid
);
