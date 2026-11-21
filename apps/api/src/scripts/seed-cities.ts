import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { cityService } from '../services/city.service.js';
import { logger } from '../utils/logger.js';

async function seed() {
  try {
    await connectDatabase();
    logger.info('Connected to MongoDB. Seeding Tier-2 and Tier-3 pilot cities...');
    await cityService.seedCities();
    logger.info('✔ Pilot cities seeded successfully (Jaipur, Indore, Lucknow, Coimbatore).');
  } catch (error) {
    logger.error({ err: error }, 'Error seeding cities');
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
