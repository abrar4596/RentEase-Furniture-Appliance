import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { CartOwner } from '../services/cart.service.js';

export const DEVICE_COOKIE_NAME = 'rentease_device';
const DEVICE_COOKIE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      cartOwner?: CartOwner;
    }
  }
}

/**
 * Resolves the owner of the current cart request.
 *
 * Authenticated requests are keyed by the user id; anonymous requests are keyed
 * by an httpOnly device cookie so a guest can build a cart before logging in.
 * The guest cart is later merged into the user's cart on login.
 *
 * Must run after `optionalAuthenticate` so `req.user` is populated when present.
 */
export function resolveCartOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    req.cartOwner = { kind: 'user', userId: req.user._id.toString() };
    next();
    return;
  }

  let guestId = req.cookies?.[DEVICE_COOKIE_NAME];
  if (typeof guestId !== 'string' || guestId.length < 16) {
    guestId = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE_NAME, guestId, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  req.cartOwner = { kind: 'guest', guestId };
  next();
}
