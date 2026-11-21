import bcrypt from 'bcryptjs';
import { USER_ROLES } from '@rentease/shared';
import { User } from '../models/user.model.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

async function seedAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rentease.in';
  const adminPassword = process.env.ADMIN_PASSWORD || 'RentEase@Admin2026';
  const adminName = process.env.ADMIN_NAME || 'Platform Admin';

  try {
    await connectDatabase();

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      logger.info({ email: adminEmail }, 'Platform Admin already exists. No action required.');
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await User.create({
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: USER_ROLES.ADMIN,
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });

    logger.info(
      { id: admin._id.toString(), email: admin.email, role: admin.role },
      '✔ Platform Admin successfully seeded via CLI.'
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed Platform Admin');
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

seedAdmin().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal admin seed failure:', err);
  process.exit(1);
});
