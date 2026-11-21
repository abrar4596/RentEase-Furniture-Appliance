import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation error', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const reqId = (req as unknown as { id?: string }).id ?? 'unknown';

  // Handle direct Zod errors
  const isZod =
    err instanceof ZodError ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name: string }).name === 'ZodError');

  if (isZod) {
    const zodErr = err as ZodError;
    const details = zodErr.issues.map((e: { path: PropertyKey[]; message: string }) => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    });
    return;
  }

  const isOperational =
    err instanceof AppError ||
    (typeof err === 'object' &&
      err !== null &&
      'isOperational' in err &&
      Boolean((err as AppError).isOperational));

  if (isOperational) {
    const appErr = err as AppError;
    logger.warn(
      {
        requestId: reqId,
        code: appErr.code,
        statusCode: appErr.statusCode,
        message: appErr.message,
        path: req.path,
        method: req.method,
      },
      `Operational error: ${appErr.message}`
    );

    res.status(appErr.statusCode || 400).json({
      success: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        ...(appErr.details ? { details: appErr.details } : {}),
      },
    });
    return;
  }

  // Unexpected / programmer error: never leak internals to client in production
  logger.error(
    {
      requestId: reqId,
      err,
      path: req.path,
      method: req.method,
    },
    `Unexpected internal server error: ${err.message}`
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'An unexpected server error occurred' : err.message,
      ...(env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    },
  });
}
