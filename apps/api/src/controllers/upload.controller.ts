import { Request, Response, NextFunction } from 'express';
import { uploadService, UploadFolder } from '../services/upload.service.js';
import { UnauthorizedError } from '../middleware/error-handler.js';

export class UploadController {
  public async getUploadSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const folder = (req.body.folder || 'products') as UploadFolder;
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
