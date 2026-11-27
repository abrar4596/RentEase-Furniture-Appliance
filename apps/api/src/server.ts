import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';
import { checkoutService } from './services/checkout.service.js';
import { runKycTimeoutJob } from './jobs/kyc-timeout.job.js';

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

  let reconciliationTimer: NodeJS.Timeout | undefined;
  let kycTimeoutTimer: NodeJS.Timeout | undefined;

  if (env.NODE_ENV !== 'test') {
    // Reconcile expired inventory locks every 60 s.
    reconciliationTimer = setInterval(() => {
      checkoutService
        .reconcileExpiredLocks()
        .then((units) => {
          if (units > 0) logger.info({ units }, 'Reconciled expired inventory locks');
        })
        .catch((error) =>
          logger.error({ err: error }, 'Expired inventory lock reconciliation failed')
        );
    }, 60 * 1000);
    reconciliationTimer.unref();

    // Run KYC timeout / reminder job every 15 minutes.
    // Run once immediately on startup to pick up any orders that lapsed during downtime.
    runKycTimeoutJob().catch((err) => logger.error({ err }, 'Initial KYC timeout job failed'));
    kycTimeoutTimer = setInterval(() => {
      runKycTimeoutJob().catch((err) => logger.error({ err }, 'KYC timeout job failed'));
    }, 15 * 60 * 1000);
    kycTimeoutTimer.unref();
  }

  // Graceful shutdown handling
  async function gracefulShutdown(signal: string): Promise<void> {
    logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);
    if (reconciliationTimer) clearInterval(reconciliationTimer);
    if (kycTimeoutTimer) clearInterval(kycTimeoutTimer);

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
