import { Router } from 'express';
import { catalogQuerySchema } from '@rentease/shared';
import { productController } from '../controllers/product.controller.js';
import { validate } from '../middleware/validate.js';

export const catalogRouter = Router();

catalogRouter.get('/', validate({ query: catalogQuerySchema }), productController.listCatalog);
