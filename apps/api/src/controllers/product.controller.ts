import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';
import { ProductStatus, ProductCategory } from '@rentease/shared';

export class ProductController {
  public async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const product = await productService.createProduct(req.user._id.toString(), req.body);
      res.status(201).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getMyProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const status = req.query.status as ProductStatus | undefined;
      const category = req.query.category as ProductCategory | undefined;

      const products = await productService.listVendorProducts(req.user._id.toString(), {
        status,
        category,
      });

      res.status(200).json({
        success: true,
        data: { products },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const product = await productService.getProductById(id);
      res.status(200).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const id = req.params.id as string;
      const product = await productService.updateProduct(req.user._id.toString(), id, req.body);
      res.status(200).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const id = req.params.id as string;
      const product = await productService.updateStock(
        req.user._id.toString(),
        id,
        req.body.stockCount
      );
      res.status(200).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const id = req.params.id as string;
      const product = await productService.updateStatus(
        req.user._id.toString(),
        id,
        req.body.status
      );
      res.status(200).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const id = req.params.id as string;
      await productService.deleteProduct(req.user._id.toString(), id);
      res.status(200).json({
        success: true,
        data: { message: 'Product deleted successfully' },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
