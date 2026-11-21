import { Request, Response, NextFunction } from 'express';
import { uploadService, UploadFolder } from '../services/upload.service.js';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../middleware/error-handler.js';

export class UploadController {
  public async getUploadSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const folder = (req.body.folder || 'products') as UploadFolder;
      if (folder === 'kyc' && req.user.role !== 'renter') {
        throw new ForbiddenError('Only renters may request KYC uploads');
      }
      if (folder === 'products' && req.user.role !== 'vendor') {
        throw new ForbiddenError('Only vendors may request product uploads');
      }
      if (!['products', 'kyc', 'maintenance'].includes(folder)) {
        throw new ValidationError(`Invalid upload folder: '${folder}'`);
      }
      const params = uploadService.generateSignedUploadParameters(folder, req.user._id.toString());

      res.status(200).json({
        success: true,
        data: params,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
