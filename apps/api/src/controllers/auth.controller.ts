import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { cartService } from '../services/cart.service.js';
import { DEVICE_COOKIE_NAME } from '../middleware/cart-owner.js';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: REFRESH_COOKIE_PATH,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  });
}

function clearDeviceCookie(res: Response): void {
  res.clearCookie(DEVICE_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function validateRefreshOrigin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (env.NODE_ENV !== 'production') {
    next();
    return;
  }
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  let refererOrigin: string | undefined;
  if (typeof referer === 'string') {
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      refererOrigin = undefined;
    }
  }
  const source = origin || refererOrigin;
  if (source !== env.CORS_ORIGIN) {
    next(new UnauthorizedError('Cross-site authentication request rejected.'));
    return;
  }
  next();
}

/**
 * Moves an anonymous device cart into the authenticated user's cart. This never
 * blocks login: any failure is logged and the device cookie is still cleared.
 */
async function mergeGuestCart(req: Request, res: Response, userId: string): Promise<void> {
  const guestId = req.cookies?.[DEVICE_COOKIE_NAME];
  if (typeof guestId !== 'string' || guestId.length < 16) return;
  try {
    await cartService.mergeGuestCart(guestId, userId);
  } catch (error) {
    logger.warn({ err: error }, 'Guest cart merge failed during login');
  }
  clearDeviceCookie(res);
}

export class AuthController {
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      setRefreshCookie(res, result.refreshToken);

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      await mergeGuestCart(req, res, result.user.id);
      setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!rawToken) {
        throw new UnauthorizedError('No refresh token provided.');
      }

      const result = await authService.rotateRefreshToken(rawToken);
      setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      clearRefreshCookie(res);
      next(error);
    }
  }

  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (rawToken) {
        await authService.logout(rawToken);
      }
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully.' },
      });
    } catch (error) {
      next(error);
    }
  }

  public async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user) {
        await authService.logoutAll(req.user._id.toString());
      }
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: { message: 'All active sessions have been revoked.' },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const user = await authService.getMe(req.user._id.toString());

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  public async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.forgotPassword(req.body.email);
      res.status(200).json({
        success: true,
        data: {
          message:
            'If an account with that email exists, a password reset link has been dispatched.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.resetPassword(req.body);
      clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: {
          message: 'Password has been successfully reset. Please log in with your new credentials.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.googleAuth(req.body.credential);
      await mergeGuestCart(req, res, result.user.id);
      setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
