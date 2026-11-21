import { Router } from 'express';
import { productController } from '../controllers/product.controller.js';

export const catalogRouter = Router();

catalogRouter.get('/', productController.listCatalog);
