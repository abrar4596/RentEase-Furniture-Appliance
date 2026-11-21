import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  USER_ROLES,
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
} from '@rentease/shared';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { City } from '../src/models/city.model.js';
import { VendorProfile } from '../src/models/vendor.model.js';
import { Product } from '../src/models/product.model.js';
import { authService } from '../src/services/auth.service.js';
import { cityService } from '../src/services/city.service.js';

describe('Phase 2: Vendor Onboarding & Inventory Management Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let adminToken: string;
  let vendor1Token: string;
  let vendor2Token: string;
  let renterToken: string;

  let jaipurId: string;
  let vendor1ProfileId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await City.deleteMany({});
    await VendorProfile.deleteMany({});
    await Product.deleteMany({});

    // Seed cities
    await cityService.seedCities();
    const jaipur = await City.findOne({ name: 'Jaipur' });
    jaipurId = jaipur!._id.toString();

    // 1. Admin
    const adminUser = await User.create({
      email: 'admin@rentease.in',
      name: 'Super Admin',
      role: USER_ROLES.ADMIN,
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });
    adminToken = authService.generateAccessToken(adminUser);

    // 2. Vendor 1
    const v1User = await User.create({
      email: 'vendor1@example.com',
      name: 'Jaipur Living Store',
      role: USER_ROLES.VENDOR,
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });
    vendor1Token = authService.generateAccessToken(v1User);

    // 3. Vendor 2
    const v2User = await User.create({
      email: 'vendor2@example.com',
      name: 'Indore Appliances Hub',
      role: USER_ROLES.VENDOR,
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });
    vendor2Token = authService.generateAccessToken(v2User);

    // 4. Renter
    const renterUser = await User.create({
      email: 'renter@example.com',
      name: 'Aman Verma',
      role: USER_ROLES.RENTER,
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });
    renterToken = authService.generateAccessToken(renterUser);
  });

  describe('City & Service Zone API', () => {
    it('GET /api/v1/cities returns active pilot cities', async () => {
      const res = await request(app).get('/api/v1/cities');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cities.length).toBeGreaterThanOrEqual(4);
      expect(res.body.data.cities.some((c: any) => c.name === 'Jaipur')).toBe(true);
    });

    it('GET /api/v1/cities/:id returns specific city and its serviced pincodes', async () => {
      const res = await request(app).get(`/api/v1/cities/${jaipurId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.city.name).toBe('Jaipur');
      expect(res.body.data.city.pincodes).toContain('302001');
    });
  });

  describe('Vendor Onboarding & Admin Verification Flow', () => {
    it('creates vendor profile in PENDING status', async () => {
      const res = await request(app)
        .post('/api/v1/vendors/profile')
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          businessName: 'Royal Furniture Jaipur',
          contactPhone: '9829012345',
          cityId: jaipurId,
          servicePincodes: ['302001', '302017'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.verificationStatus).toBe(VENDOR_STATUSES.PENDING);
      expect(res.body.data.profile.businessName).toBe('Royal Furniture Jaipur');

      vendor1ProfileId = res.body.data.profile.id;
    });

    it('rejects vendor profile creation with pincodes not in selected city', async () => {
      const res = await request(app)
        .post('/api/v1/vendors/profile')
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          businessName: 'Royal Furniture Jaipur',
          contactPhone: '9829012345',
          cityId: jaipurId,
          servicePincodes: ['110001'], // Delhi pincode
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('do not belong to Jaipur');
    });

    it('prevents Renter from creating a vendor profile (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/vendors/profile')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({
          businessName: 'Fake Vendor Store',
          contactPhone: '9829012345',
          cityId: jaipurId,
          servicePincodes: ['302001'],
        });

      expect(res.status).toBe(403);
    });

    it('allows Admin to approve pending vendor', async () => {
      // 1. Create vendor profile
      const createRes = await request(app)
        .post('/api/v1/vendors/profile')
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          businessName: 'Royal Furniture Jaipur',
          contactPhone: '9829012345',
          cityId: jaipurId,
          servicePincodes: ['302001', '302017'],
        });
      const profileId = createRes.body.data.profile.id;

      // 2. Admin verifies vendor
      const verifyRes = await request(app)
        .patch(`/api/v1/vendors/admin/${profileId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: VENDOR_STATUSES.APPROVED,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.profile.verificationStatus).toBe(VENDOR_STATUSES.APPROVED);

      // 3. Vendor sees approved profile
      const meRes = await request(app)
        .get('/api/v1/vendors/me')
        .set('Authorization', `Bearer ${vendor1Token}`);
      expect(meRes.body.data.profile.verificationStatus).toBe(VENDOR_STATUSES.APPROVED);
    });
  });

  describe('Cloudinary Signed Upload API', () => {
    it('POST /api/v1/uploads/signature issues signed upload parameters', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/signature')
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({ folder: 'products' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signature).toBeDefined();
      expect(res.body.data.folder).toBe('rentease/products');
      expect(res.body.data.timestamp).toBeDefined();
    });
  });

  describe('Product Inventory Management & Ownership Checks', () => {
    let approvedVendor1Token: string;
    let pendingVendor2Token: string;

    beforeEach(async () => {
      // Setup Vendor 1 as APPROVED
      const v1Profile = await request(app)
        .post('/api/v1/vendors/profile')
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          businessName: 'Approved Jaipur Furnishers',
          contactPhone: '9829012345',
          cityId: jaipurId,
          servicePincodes: ['302001', '302017'],
        });
      vendor1ProfileId = v1Profile.body.data.profile.id;

      await request(app)
        .patch(`/api/v1/vendors/admin/${vendor1ProfileId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: VENDOR_STATUSES.APPROVED });

      approvedVendor1Token = vendor1Token;

      // Setup Vendor 2 as PENDING
      await request(app)
        .post('/api/v1/vendors/profile')
        .set('Authorization', `Bearer ${vendor2Token}`)
        .send({
          businessName: 'Pending Indore Rentals',
          contactPhone: '9829099999',
          cityId: jaipurId,
          servicePincodes: ['302001'],
        });

      pendingVendor2Token = vendor2Token;
    });

    it('prevents PENDING vendor from publishing active product (must be draft)', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${pendingVendor2Token}`)
        .send({
          category: PRODUCT_CATEGORIES.FURNITURE,
          subcategory: 'Beds & Mattresses',
          title: 'Solid Sheesham Wood Queen Bed',
          description: 'Premium quality wooden queen bed with orthopedic mattress included.',
          condition: PRODUCT_CONDITIONS.LIKE_NEW,
          stockCount: 5,
          securityDepositPaise: 0, // ₹0 deposit
          tenureTiers: [
            { tenureMonths: 1, monthlyRentPaise: 149900 },
            { tenureMonths: 3, monthlyRentPaise: 129900 },
            { tenureMonths: 6, monthlyRentPaise: 109900 },
            { tenureMonths: 12, monthlyRentPaise: 89900 },
          ],
          images: [{ publicId: 'img_bed_1', url: 'https://res.cloudinary.com/test/bed.jpg' }],
          cityId: jaipurId,
          status: PRODUCT_STATUSES.ACTIVE, // Attempting active while pending
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('pending verification');
    });

    it('allows APPROVED vendor to create active product with ₹0 deposit and tenure tiers', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${approvedVendor1Token}`)
        .send({
          category: PRODUCT_CATEGORIES.FURNITURE,
          subcategory: 'Beds & Mattresses',
          title: 'Solid Sheesham Wood Queen Bed',
          description: 'Premium quality wooden queen bed with orthopedic mattress included.',
          condition: PRODUCT_CONDITIONS.LIKE_NEW,
          stockCount: 5,
          securityDepositPaise: 0, // ₹0 deposit
          tenureTiers: [
            { tenureMonths: 1, monthlyRentPaise: 149900 },
            { tenureMonths: 3, monthlyRentPaise: 129900 },
            { tenureMonths: 6, monthlyRentPaise: 109900 },
            { tenureMonths: 12, monthlyRentPaise: 89900 },
          ],
          images: [{ publicId: 'img_bed_1', url: 'https://res.cloudinary.com/test/bed.jpg' }],
          cityId: jaipurId,
          status: PRODUCT_STATUSES.ACTIVE,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.securityDepositPaise).toBe(0);
      expect(res.body.data.product.status).toBe(PRODUCT_STATUSES.ACTIVE);
      expect(res.body.data.product.tenureTiers.length).toBe(4);
    });

    it('rejects product with invalid tier pricing (e.g. duplicate tiers or negative rent)', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${approvedVendor1Token}`)
        .send({
          category: PRODUCT_CATEGORIES.FURNITURE,
          subcategory: 'Chairs',
          title: 'Ergonomic Office Chair',
          description: 'Comfortable mesh chair for long study hours.',
          condition: PRODUCT_CONDITIONS.BRAND_NEW,
          stockCount: 10,
          securityDepositPaise: 50000,
          tenureTiers: [
            { tenureMonths: 3, monthlyRentPaise: 49900 },
            { tenureMonths: 3, monthlyRentPaise: 44900 }, // Duplicate tenure
          ],
          images: [{ publicId: 'img_chair_1', url: 'https://res.cloudinary.com/test/chair.jpg' }],
          cityId: jaipurId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Duplicate tenure tier');
    });

    it('STRICT OWNERSHIP GUARD: prevents Vendor 2 from updating or deleting Vendor 1 product', async () => {
      // 1. Vendor 1 creates product
      const createRes = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${approvedVendor1Token}`)
        .send({
          category: PRODUCT_CATEGORIES.APPLIANCES,
          subcategory: 'Refrigerators',
          title: 'Single Door Refrigerator 190L',
          description: 'Energy efficient 4-star refrigerator with quick chill zone.',
          condition: PRODUCT_CONDITIONS.LIKE_NEW,
          stockCount: 3,
          securityDepositPaise: 150000,
          tenureTiers: [{ tenureMonths: 6, monthlyRentPaise: 69900 }],
          images: [{ publicId: 'img_fridge_1', url: 'https://res.cloudinary.com/test/fridge.jpg' }],
          cityId: jaipurId,
          status: PRODUCT_STATUSES.ACTIVE,
        });

      const productId = createRes.body.data.product.id;

      // 2. Vendor 2 attempts to update Vendor 1's product -> 403 Forbidden
      const updateAttempt = await request(app)
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${pendingVendor2Token}`)
        .send({ title: 'Hacked Product Title' });

      expect(updateAttempt.status).toBe(403);
      expect(updateAttempt.body.error.message).toContain('not authorized');

      // 3. Vendor 2 attempts to delete Vendor 1's product -> 403 Forbidden
      const deleteAttempt = await request(app)
        .delete(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${pendingVendor2Token}`);

      expect(deleteAttempt.status).toBe(403);
    });

    it('allows owner vendor to update stock count and toggle status to paused', async () => {
      const createRes = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${approvedVendor1Token}`)
        .send({
          category: PRODUCT_CATEGORIES.APPLIANCES,
          subcategory: 'Washing Machines',
          title: 'Automatic Top Load Washing Machine 6.5kg',
          description: 'Fully automatic top load washing machine with multi-wash programs.',
          condition: PRODUCT_CONDITIONS.REFURBISHED,
          stockCount: 2,
          securityDepositPaise: 200000,
          tenureTiers: [{ tenureMonths: 12, monthlyRentPaise: 79900 }],
          images: [{ publicId: 'img_wm_1', url: 'https://res.cloudinary.com/test/wm.jpg' }],
          cityId: jaipurId,
          status: PRODUCT_STATUSES.ACTIVE,
        });

      const productId = createRes.body.data.product.id;

      // Update Stock
      const stockRes = await request(app)
        .patch(`/api/v1/products/${productId}/stock`)
        .set('Authorization', `Bearer ${approvedVendor1Token}`)
        .send({ stockCount: 8 });

      expect(stockRes.status).toBe(200);
      expect(stockRes.body.data.product.stockCount).toBe(8);

      // Pause product
      const statusRes = await request(app)
        .patch(`/api/v1/products/${productId}/status`)
        .set('Authorization', `Bearer ${approvedVendor1Token}`)
        .send({ status: PRODUCT_STATUSES.PAUSED });

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.product.status).toBe(PRODUCT_STATUSES.PAUSED);
    });
  });
});
