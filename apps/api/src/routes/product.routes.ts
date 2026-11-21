import { Router } from 'express';
import {
  createProductSchema,
  updateProductSchema,
  updateProductStockSchema,
  updateProductStatusSchema,
  USER_ROLES,
} from '@rentease/shared';
import { productController } from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';

export const productRouter = Router();

// Public catalog
productRouter.get('/catalog', productController.listCatalog);

// Vendor Product Management
productRouter.post(
  '/',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  validate({ body: createProductSchema }),
  productController.createProduct
);

productRouter.get(
  '/vendor/mine',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  productController.getMyProducts
);

productRouter.get('/:id', productController.getProduct);

productRouter.patch(
  '/:id',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  validate({ body: updateProductSchema }),
  productController.updateProduct
);

productRouter.patch(
  '/:id/stock',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  validate({ body: updateProductStockSchema }),
  productController.updateStock
);

productRouter.patch(
  '/:id/status',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  validate({ body: updateProductStatusSchema }),
  productController.updateStatus
);

productRouter.delete(
  '/:id',
  authenticate,
  authorize(USER_ROLES.VENDOR),
  productController.deleteProduct
);
