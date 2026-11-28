import { Request, Response, NextFunction } from 'express';
import { addressService } from '../services/address.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';

export class AddressController {
  private requireUser(req: Request): string {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    return req.user._id.toString();
  }

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const addresses = await addressService.list(this.requireUser(req));
      res.json({ success: true, data: { addresses } });
    } catch (error) {
      next(error);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const address = await addressService.create(this.requireUser(req), req.body);
      res.status(201).json({ success: true, data: { address } });
    } catch (error) {
      next(error);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const address = await addressService.update(
        this.requireUser(req),
        req.params.id as string,
        req.body
      );
      res.json({ success: true, data: { address } });
    } catch (error) {
      next(error);
    }
  };

  public remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await addressService.remove(this.requireUser(req), req.params.id as string);
      res.json({ success: true, data: { message: 'Address removed' } });
    } catch (error) {
      next(error);
    }
  };
}

export const addressController = new AddressController();
