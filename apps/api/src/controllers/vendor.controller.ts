import { Request, Response, NextFunction } from 'express';
import { vendorService } from '../services/vendor.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';
import { VendorStatus } from '@rentease/shared';
import { adminService } from '../services/admin.service.js';

export class VendorController {
  public async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const profile = await vendorService.getFormattedProfileByUserId(req.user._id.toString());
      res.status(200).json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  public async createProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const profile = await vendorService.createProfile(req.user._id.toString(), req.body);
      res.status(201).json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const profile = await vendorService.updateProfile(req.user._id.toString(), req.body);
      res.status(200).json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  public async adminListVendors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as VendorStatus | undefined;
      const vendors = await vendorService.adminListVendors(status);
      res.status(200).json({
        success: true,
        data: { vendors },
      });
    } catch (error) {
      next(error);
    }
  }

  public async adminVerifyVendor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const id = req.params.id as string;
      const profile = await vendorService.adminVerifyVendor(id, req.body);
      await adminService.recordAudit(
        req.user._id.toString(),
        'VENDOR_VERIFICATION_UPDATED',
        'vendor',
        id,
        req.body.rejectionReason,
        { status: req.body.status }
      );
      res.status(200).json({
        success: true,
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  public async adminUpdateCommission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const id = req.params.id as string;
      const profile = await vendorService.adminUpdateCommission(id, req.body);
      await adminService.recordAudit(
        req.user._id.toString(),
        'VENDOR_COMMISSION_UPDATED',
        'vendor',
        id,
        undefined,
        { commissionPercent: req.body.commissionPercent }
      );
      res.status(200).json({ success: true, data: { profile } });
    } catch (error) {
      next(error);
    }
  }
}

export const vendorController = new VendorController();
