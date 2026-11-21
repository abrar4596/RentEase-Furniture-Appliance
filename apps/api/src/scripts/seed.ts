import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

async function seedDatabase(): Promise<void> {
  logger.info('Starting RentEase database seed script...');

  try {
    await connectDatabase();
    logger.info('Database connected. Ready for phase seed data (cities, vendors, inventory).');

    // Scaffolding for upcoming phases:
    // Phase 1: Default Platform Admin account
    // Phase 2: Tier-2 / Tier-3 cities and sample service pincodes
    // Phase 3: Sample vendor catalog items with 1/3/6/12 month tiers

    logger.info('Seed placeholder completed successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Error occurred during database seeding');
    process.exit(1);
  } finally {
    await disconnectDatabase();
    logger.info('Database disconnected.');
  }
}

seedDatabase().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal seed failure:', err);
  process.exit(1);
});
