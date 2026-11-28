import { Request, Response, NextFunction } from 'express';
import { cartService, CartOwner } from '../services/cart.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';

export class CartController {
  private owner(req: Request): CartOwner {
    if (!req.cartOwner) throw new UnauthorizedError('Cart session unavailable');
    return req.cartOwner;
  }

  public getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.getCart(this.owner(req));
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.addItem(this.owner(req), req.body);
      res.status(200).json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public updateItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.updateItem(
        this.owner(req),
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
      const cart = await cartService.removeItem(this.owner(req), req.params.productId as string);
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public setDelivery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await cartService.setDelivery(this.owner(req), req.body);
      res.json({ success: true, data: { cart } });
    } catch (error) {
      next(error);
    }
  };
  public getDeliverySlots = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const slots = await cartService.getDeliverySlots(
        this.owner(req),
        req.query.pincode as string,
        req.query.date as string
      );
      res.json({ success: true, data: { slots } });
    } catch (error) {
      next(error);
    }
  };
  public clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await cartService.clearCart(this.owner(req));
      res.json({ success: true, data: { cart: await cartService.getCart(this.owner(req)) } });
    } catch (error) {
      next(error);
    }
  };
}

export const cartController = new CartController();
