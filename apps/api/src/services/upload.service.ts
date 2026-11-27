import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { ValidationError } from '../middleware/error-handler.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type UploadFolder = 'products' | 'kyc' | 'maintenance';

export interface SignedUploadResponse {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  uploadPreset?: string;
  tags?: string[];
}

export class UploadService {
  /**
   * Generates a short-lived signed upload payload scoped strictly to a folder.
   * Product uploads go to public 'rentease/products'
   * KYC uploads go to authenticated 'rentease/kyc'
   */
  public generateSignedUploadParameters(
    folderType: UploadFolder,
    userId: string
  ): SignedUploadResponse {
    const allowedFolders: Record<UploadFolder, string> = {
      products: 'rentease/products',
      kyc: 'rentease/kyc',
      maintenance: 'rentease/maintenance',
    };

    const targetFolder = allowedFolders[folderType];
    if (!targetFolder) {
      throw new ValidationError(`Invalid upload folder: '${folderType}'`);
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const tags = [`user_${userId}`, folderType];

    // Params to sign for Cloudinary
    const paramsToSign: Record<string, string | number> = {
      folder: targetFolder,
      timestamp,
      tags: tags.join(','),
    };

    let signature = '';

    if (env.NODE_ENV === 'test' || env.CLOUDINARY_API_SECRET === 'test_api_secret_abcdefghijk') {
      // Deterministic mock signature for tests
      const paramString = Object.keys(paramsToSign)
        .sort()
        .map((key) => `${key}=${paramsToSign[key]}`)
        .join('&');
      signature = crypto
        .createHash('sha1')
        .update(`${paramString}${env.CLOUDINARY_API_SECRET}`)
        .digest('hex');
    } else {
      signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);
    }

    return {
      signature,
      timestamp,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      folder: targetFolder,
      tags,
    };
  }
  /**
   * Generates a short-lived authenticated URL for viewing a private KYC document
   * stored in Cloudinary authenticated delivery mode.
   *
   * The URL expires in `expiresInSeconds` (default 300s / 5 min). Only call this
   * for admin or vendor-review flows — never expose to arbitrary clients.
   */
  public generateKycViewUrl(publicId: string, expiresInSeconds = 300): string {
    const expiresAt = Math.round(Date.now() / 1000) + expiresInSeconds;

    if (env.NODE_ENV === 'test' || env.CLOUDINARY_API_SECRET === 'test_api_secret_abcdefghijk') {
      // Return a stable stub URL in test/dev so tests don't need real Cloudinary.
      return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/authenticated/s--stub--/e_expires_${expiresAt}/${publicId}`;
    }

    // Build a signed authenticated delivery URL via the Cloudinary SDK.
    return cloudinary.url(publicId, {
      type: 'authenticated',
      sign_url: true,
      auth_token: { duration: expiresInSeconds },
      resource_type: 'image',
      expires_at: expiresAt,
    });
  }
}

export const uploadService = new UploadService();
