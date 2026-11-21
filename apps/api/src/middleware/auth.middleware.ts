import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole, TokenPayload } from '@rentease/shared';
import { User, IUserDocument } from '../models/user.model.js';
import { UnauthorizedError, ForbiddenError } from './error-handler.js';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: IUserDocument;
    }
  }
}

/**
 * Authenticates requests using Bearer JWT access token
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token missing or invalid');
    }

    const token = authHeader.substring(7).trim();
    let payload: TokenPayload;

    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    } catch {
      throw new UnauthorizedError('Access token is invalid or expired');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError('The user associated with this token no longer exists');
    }

    if (user.status === 'suspended') {
      throw new ForbiddenError('Your account has been suspended');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authorizes request based on user roles
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access restricted: requires one of the following roles: [${roles.join(', ')}]`
        )
      );
    }

    next();
  };
}
