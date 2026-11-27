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

  /**
   * Returns a short-lived authenticated Cloudinary URL for a single KYC document.
   * Only admins may call this endpoint. The `publicId` is submitted by the renter
   * when they upload their KYC; the admin supplies it back via query param.
   * This keeps KYC assets in Cloudinary authenticated delivery — never public.
   */
  public async getKycViewUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      if (req.user.role !== 'admin') {
        throw new ForbiddenError('Only admins may request KYC view URLs');
      }

      const publicId = req.query.publicId;
      if (typeof publicId !== 'string' || publicId.trim().length === 0) {
        throw new ValidationError('publicId query parameter is required');
      }

      // Restrict to the KYC folder prefix so this endpoint cannot be used to
      // generate signed URLs for arbitrary Cloudinary assets.
      const normalised = publicId.trim();
      if (!normalised.startsWith('rentease/kyc/')) {
        throw new ValidationError('publicId must be within the rentease/kyc/ folder');
      }

      const url = uploadService.generateKycViewUrl(normalised);
      res.json({ success: true, data: { url } });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
