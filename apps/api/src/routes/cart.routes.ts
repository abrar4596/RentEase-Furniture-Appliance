import { Router } from 'express';
import { cartController } from '../controllers/cart.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  addCartItemSchema,
  updateCartItemSchema,
  deliveryScheduleSchema,
  USER_ROLES,
} from '@rentease/shared';

export const cartRouter = Router();

cartRouter.use(authenticate, authorize(USER_ROLES.RENTER));
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
