import { Request, Response, NextFunction } from 'express';
import { payoutService } from '../services/payout.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';
import { adminService } from '../services/admin.service.js';

export class PayoutController {
  public async listAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: { entries: await payoutService.listAdminLedger() } });
    } catch (error) {
      next(error);
    }
  }

  public async getVendor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const result = await payoutService.getVendorLedger(req.user._id.toString());
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  public async markPaid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const entries = await payoutService.markPaid(req.user._id.toString(), req.body);
      await adminService.recordAudit(
        req.user._id.toString(),
        'VENDOR_PAYOUT_MARKED_PAID',
        'payout',
        req.body.vendorId,
        req.body.payoutReference,
        { ledgerEntryIds: req.body.ledgerEntryIds }
      );
      res.json({ success: true, data: { entries } });
    } catch (error) {
      next(error);
    }
  }
}

export const payoutController = new PayoutController();
