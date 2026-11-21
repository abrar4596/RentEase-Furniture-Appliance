import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const requestId = typeof existingId === 'string' && existingId.trim() ? existingId : randomUUID();

  // Attach to request and response header
  (req as unknown as { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
