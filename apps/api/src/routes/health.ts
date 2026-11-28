import { Router, Request, Response } from 'express';
import { getDbStatus } from '../config/database.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const dbStatus = getDbStatus();
  const isHealthy = dbStatus === 'connected' || env.NODE_ENV === 'test';

  res.status(isHealthy ? 200 : 503).json({
    success: true,
    data: {
      status: isHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      db: dbStatus,
      memory: {
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
    },
  });
});
