import { Router } from 'express';
import { addressController } from '../controllers/address.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { addressInputSchema, addressUpdateSchema, USER_ROLES } from '@rentease/shared';

export const addressRouter = Router();

addressRouter.use(authenticate, authorize(USER_ROLES.RENTER));
addressRouter.get('/', addressController.list);
addressRouter.post('/', validate({ body: addressInputSchema }), addressController.create);
addressRouter.patch('/:id', validate({ body: addressUpdateSchema }), addressController.update);
addressRouter.delete('/:id', addressController.remove);
