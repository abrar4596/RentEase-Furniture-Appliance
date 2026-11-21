import { Request, Response, NextFunction } from 'express';
import { cartService } from '../services/cart.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';

export class CartController {
  private requireUser(req: Request): string {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    return req.user._id.toString();
  }

  public getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.getCart(this.requireUser(req));
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.addItem(this.requireUser(req), req.body);
      res.status(200).json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public updateItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.updateItem(
        this.requireUser(req),
        req.params.productId as string,
        req.body
      );
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.removeItem(
        this.requireUser(req),
        req.params.productId as string
      );
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public setDelivery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.setDelivery(this.requireUser(req), req.body);
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await cartService.clearCart(this.requireUser(req));
      res.json({ success: true, data: { cart: await cartService.getCart(this.requireUser(req)) } });
    } catch (error) {
      next(error);
    }
  };
}

export const cartController = new CartController();
