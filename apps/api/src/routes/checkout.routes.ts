import { Router } from 'express';
import { checkoutController } from '../controllers/checkout.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { createCheckoutSchema, verifyPaymentSchema, USER_ROLES } from '@rentease/shared';

export const checkoutRouter = Router();

checkoutRouter.post('/webhook', checkoutController.webhook);
checkoutRouter.post(
  '/checkout',
  authenticate,
  authorize(USER_ROLES.RENTER),
  validate({ body: createCheckoutSchema }),
  checkoutController.createCheckout
);
checkoutRouter.post(
  '/verify',
  authenticate,
  authorize(USER_ROLES.RENTER),
  validate({ body: verifyPaymentSchema }),
  checkoutController.verifyPayment
);
