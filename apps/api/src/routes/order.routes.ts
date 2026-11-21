import { Router } from 'express';
import { checkoutController } from '../controllers/checkout.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  createCheckoutSchema,
  USER_ROLES,
  submitKycSchema,
  reviewKycSchema,
  updateOrderFulfillmentSchema,
  maintenanceRequestSchema,
  extendTenureSchema,
  returnRequestSchema,
  returnCompleteSchema,
} from '@rentease/shared';
import { validate } from '../middleware/validate.js';
import { verifyPaymentSchema } from '@rentease/shared';

export const orderRouter = Router();

orderRouter.use(authenticate);
orderRouter.post(
  '/checkout',
  authorize(USER_ROLES.RENTER),
  validate({ body: createCheckoutSchema }),
  checkoutController.createCheckout
);
orderRouter.get('/', authorize(USER_ROLES.RENTER), checkoutController.getOrders);
orderRouter.get('/vendor/mine', authorize(USER_ROLES.VENDOR), checkoutController.getVendorOrders);
orderRouter.patch(
  '/vendor/:id/status',
  authorize(USER_ROLES.VENDOR),
  validate({ body: updateOrderFulfillmentSchema }),
  checkoutController.updateVendorOrderStatus
);
orderRouter.patch(
  '/vendor/:id/return',
  authorize(USER_ROLES.VENDOR),
  validate({ body: returnCompleteSchema }),
  checkoutController.completeReturn
);
orderRouter.get('/admin/kyc', authorize(USER_ROLES.ADMIN), checkoutController.adminListPendingKyc);
orderRouter.patch(
  '/admin/:id/kyc',
  authorize(USER_ROLES.ADMIN),
  validate({ body: reviewKycSchema }),
  checkoutController.adminReviewKyc
);
orderRouter.get('/:id', authorize(USER_ROLES.RENTER), checkoutController.getOrder);
orderRouter.post('/:id/cancel', authorize(USER_ROLES.RENTER), checkoutController.cancelOrder);
orderRouter.post(
  '/:id/verify-payment',
  authorize(USER_ROLES.RENTER),
  validate({ body: verifyPaymentSchema }),
  checkoutController.verifyPayment
);
orderRouter.post(
  '/:id/kyc',
  authorize(USER_ROLES.RENTER),
  validate({ body: submitKycSchema }),
  checkoutController.submitKyc
);
orderRouter.post(
  '/:id/maintenance',
  authorize(USER_ROLES.RENTER),
  validate({ body: maintenanceRequestSchema }),
  checkoutController.addMaintenanceRequest
);
orderRouter.post(
  '/:id/extend',
  authorize(USER_ROLES.RENTER),
  validate({ body: extendTenureSchema }),
  checkoutController.extendTenure
);
orderRouter.post(
  '/:id/return',
  authorize(USER_ROLES.RENTER),
  validate({ body: returnRequestSchema }),
  checkoutController.requestReturn
);
