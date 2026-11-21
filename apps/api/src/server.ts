import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Attempt database connection
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, environment: env.NODE_ENV },
      `🚀 RentEase API server listening on http://localhost:${env.PORT}`
    );
  });

  // Graceful shutdown handling
  async function gracefulShutdown(signal: string): Promise<void> {
    logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('Process terminated gracefully');
      process.exit(0);
    });

    // Force exit if not terminated within 10s
    setTimeout(() => {
      logger.error('Forcefully terminating process after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start API bootstrap');
  process.exit(1);
});
