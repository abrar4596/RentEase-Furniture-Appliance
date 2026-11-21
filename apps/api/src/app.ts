import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandler, NotFoundError } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.routes.js';

export function createApp(): Express {
  const app = express();

  // Security HTTP headers
  app.use(helmet());

  // Strict CORS policy
  app.use(
    cors({
      origin: [env.CORS_ORIGIN],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    })
  );

  // Correlation request ID tracking
  app.use(requestIdMiddleware);

  // Cookie Parser
  app.use(cookieParser(env.COOKIE_SECRET));

  // Global Rate Limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.NODE_ENV === 'test' ? 10000 : env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP. Please try again later.',
      },
    },
  });
  app.use('/api/', limiter);

  // Body parser with payload size limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Routes
  app.use('/', healthRouter);
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);

  // 404 Handler
  app.use((_req, _res, next) => {
    next(new NotFoundError('The requested endpoint does not exist'));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
