import { Router, Request, Response, NextFunction } from 'express';
import { cartController } from '../controllers/cart.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import { resolveCartOwner } from '../middleware/cart-owner.js';
import { validate } from '../middleware/validate.js';
import { ForbiddenError } from '../middleware/error-handler.js';
import {
  addCartItemSchema,
  updateCartItemSchema,
  deliveryScheduleSchema,
  deliverySlotsQuerySchema,
  USER_ROLES,
} from '@rentease/shared';

export const cartRouter = Router();

/**
 * The cart is shared by authenticated renters and anonymous guests. Guests are
 * identified by an httpOnly device cookie (see `resolveCartOwner`). Authenticated
 * non-renters are rejected so the cart keeps its renter-only RBAC intent.
 */
function renterOrGuest(req: Request, _res: Response, next: NextFunction): void {
  if (req.user && req.user.role !== USER_ROLES.RENTER) {
    next(new ForbiddenError('The cart is available to renters only'));
    return;
  }
  next();
}

cartRouter.use(optionalAuthenticate, renterOrGuest, resolveCartOwner);

cartRouter.get(
  '/delivery/slots',
  validate({ query: deliverySlotsQuerySchema }),
  cartController.getDeliverySlots
);
cartRouter.get('/', cartController.getCart);
cartRouter.post('/', validate({ body: addCartItemSchema }), cartController.addItem);
cartRouter.post('/items', validate({ body: addCartItemSchema }), cartController.addItem);
cartRouter.patch(
  '/:productId',
  validate({ body: updateCartItemSchema }),
  cartController.updateItem
);
cartRouter.delete('/:productId', cartController.removeItem);
cartRouter.patch(
  '/items/:productId',
  validate({ body: updateCartItemSchema }),
  cartController.updateItem
);
cartRouter.delete('/items/:productId', cartController.removeItem);
cartRouter.delete('/', cartController.clearCart);
cartRouter.put('/delivery', validate({ body: deliveryScheduleSchema }), cartController.setDelivery);
