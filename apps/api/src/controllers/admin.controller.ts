import { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/admin.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';
import { City } from '../models/city.model.js';

export class AdminController {
  private actorId = (req: Request): string => {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    return req.user._id.toString();
  };

  public metrics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: { metrics: await adminService.getMetrics() } });
    } catch (error) {
      next(error);
    }
  };
  public searchOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          orders: await adminService.searchOrders(
            req.query as { status?: string; renterId?: string; orderId?: string }
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  };
  public audit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          events: await adminService.getAudit(
            req.query.entityType as string | undefined,
            req.query.entityId as string | undefined
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  };
  public arbitrateDamage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          order: await adminService.arbitrateDamage(
            this.actorId(req),
            req.params.id as string,
            req.body
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  };
  public settings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: { settings: await adminService.getSettings() } });
    } catch (error) {
      next(error);
    }
  };
  public updateSettings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        data: { settings: await adminService.updateSettings(this.actorId(req), req.body) },
      });
    } catch (error) {
      next(error);
    }
  };
  public listCities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: { cities: await City.find().sort({ name: 1 }) } });
    } catch (error) {
      next(error);
    }
  };
  public createCity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json({
        success: true,
        data: { city: await adminService.createCity(this.actorId(req), req.body) },
      });
    } catch (error) {
      next(error);
    }
  };
  public updateCity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          city: await adminService.updateCity(this.actorId(req), req.params.id as string, req.body),
        },
      });
    } catch (error) {
      next(error);
    }
  };
  public ledger = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: { entries: await adminService.listLedger() } });
    } catch (error) {
      next(error);
    }
  };
  public supportTickets = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        data: { tickets: await adminService.listSupportTickets() },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const adminController = new AdminController();
