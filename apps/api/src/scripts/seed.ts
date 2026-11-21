import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import { City } from '../models/city.model.js';
import { User } from '../models/user.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { Product } from '../models/product.model.js';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  USER_ROLES,
  VENDOR_STATUSES,
} from '@rentease/shared';

async function seedDatabase(): Promise<void> {
  logger.info('Starting RentEase database seed script...');

  try {
    await connectDatabase();
    logger.info('Database connected. Ready for phase seed data (cities, vendors, inventory).');

    if (process.env.DEMO_SEED === 'true') {
      const password = process.env.DEMO_PASSWORD;
      if (!password) throw new Error('DEMO_PASSWORD is required when DEMO_SEED=true');

      let city = await City.findOne({ name: 'Jaipur' });
      if (!city) {
        city = await City.create({
          name: 'Jaipur',
          state: 'Rajasthan',
          pincodes: ['302001', '302002', '302017', '302020'],
          isActive: true,
        });
      }

      let vendorUser = await User.findOne({ email: 'demo.vendor@rentease.test' });
      if (!vendorUser) {
        vendorUser = await User.create({
          email: 'demo.vendor@rentease.test',
          name: 'Demo Jaipur Rentals',
          passwordHash: await bcrypt.hash(password, 12),
          phone: '9876543210',
          role: USER_ROLES.VENDOR,
          status: 'active',
          authProviders: [{ provider: 'local', providerId: 'demo.vendor@rentease.test' }],
        });
      }

      let vendor = await VendorProfile.findOne({ userId: vendorUser._id });
      if (!vendor) {
        vendor = await VendorProfile.create({
          userId: vendorUser._id,
          businessName: 'Demo Jaipur Rentals',
          contactPhone: '9876543210',
          cityId: city._id,
          servicePincodes: city.pincodes,
          verificationStatus: VENDOR_STATUSES.APPROVED,
        });
      }

      const demoProducts = [
        {
          title: 'Compact Study Table',
          subcategory: 'study-table',
          category: PRODUCT_CATEGORIES.FURNITURE,
          description: 'A compact study table suitable for student and work-from-home rooms.',
          stockCount: 3,
          securityDepositPaise: 200000,
          tenureTiers: [
            { tenureMonths: 1, monthlyRentPaise: 70000 },
            { tenureMonths: 3, monthlyRentPaise: 65000 },
            { tenureMonths: 6, monthlyRentPaise: 60000 },
            { tenureMonths: 12, monthlyRentPaise: 55000 },
          ],
        },
        {
          title: 'Single Door Refrigerator',
          subcategory: 'refrigerator',
          category: PRODUCT_CATEGORIES.APPLIANCES,
          description: 'A 190 litre single-door refrigerator for a small household.',
          stockCount: 2,
          securityDepositPaise: 300000,
          tenureTiers: [
            { tenureMonths: 1, monthlyRentPaise: 140000 },
            { tenureMonths: 3, monthlyRentPaise: 130000 },
            { tenureMonths: 6, monthlyRentPaise: 120000 },
            { tenureMonths: 12, monthlyRentPaise: 110000 },
          ],
        },
      ];

      for (const product of demoProducts) {
        const existing = await Product.findOne({ vendorId: vendor._id, title: product.title });
        if (!existing) {
          await Product.create({
            ...product,
            vendorId: vendor._id,
            cityId: city._id,
            specs: { brand: 'Demo', condition: 'Like new' },
            images: [
              {
                publicId: `demo/${product.subcategory}`,
                url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
                thumbnailUrl:
                  'https://res.cloudinary.com/demo/image/upload/c_thumb,w_200,h_200/sample.jpg',
              },
            ],
            condition: PRODUCT_CONDITIONS.LIKE_NEW,
            deliveryLeadTimeHours: 48,
            status: PRODUCT_STATUSES.ACTIVE,
          });
        }
      }
      logger.info(
        { city: city.name, vendor: vendor.businessName },
        'Seeded realistic Jaipur demo data'
      );
    } else {
      logger.info(
        'Demo seed skipped; set DEMO_SEED=true and DEMO_PASSWORD to seed local demo data'
      );
    }

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
