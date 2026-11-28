import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { getTestMongoUri } from './global-setup.js';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_AVAILABILITIES,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
} from '@rentease/shared';
import { createApp } from '../src/app.js';
import { City } from '../src/models/city.model.js';
import { VendorProfile } from '../src/models/vendor.model.js';
import { Product, IProductDocument } from '../src/models/product.model.js';
import { WaitlistEntry } from '../src/models/waitlist.model.js';
import { cityService } from '../src/services/city.service.js';

/** Recursively collect every `stage` name in a MongoDB explain winning plan. */
function collectPlanStages(plan: unknown, acc: string[] = []): string[] {
  if (!plan || typeof plan !== 'object') return acc;
  const node = plan as Record<string, unknown>;
  if (typeof node.stage === 'string') acc.push(node.stage);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => collectPlanStages(child, acc));
    else if (value && typeof value === 'object') collectPlanStages(value, acc);
  }
  return acc;
}

describe('Phase 3: City-Aware Catalog, Availability & Waitlist', () => {
  const app = createApp();

  let jaipurId: string;
  let vendorId: mongoose.Types.ObjectId;

  let productA: IProductDocument;
  let productB: IProductDocument;
  let productC: IProductDocument;
  let productD: IProductDocument;

  beforeAll(async () => {
    await mongoose.connect(getTestMongoUri());
    await Product.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await City.deleteMany({});
    await VendorProfile.deleteMany({});
    await WaitlistEntry.deleteMany({});

    await cityService.seedCities();
    const jaipur = await City.findOne({ name: 'Jaipur' });
    jaipurId = jaipur!._id.toString();

    const vendor = await VendorProfile.create({
      userId: new mongoose.Types.ObjectId(),
      businessName: 'Phase 3 Jaipur Furnishers',
      contactPhone: '9829012345',
      cityId: jaipur!._id,
      servicePincodes: ['302001', '302017'],
      verificationStatus: VENDOR_STATUSES.APPROVED,
    });
    vendorId = vendor._id;

    const base = {
      vendorId,
      cityId: jaipur!._id,
      specs: { brand: 'RentEase' },
      images: [{ publicId: 'img', url: 'https://res.cloudinary.com/test/product.jpg' }],
      condition: PRODUCT_CONDITIONS.LIKE_NEW,
      deliveryLeadTimeHours: 48,
      status: PRODUCT_STATUSES.ACTIVE,
    } as const;

    productA = await Product.create({
      ...base,
      category: PRODUCT_CATEGORIES.FURNITURE,
      subcategory: 'Chairs',
      title: 'Budget Study Chair',
      description: 'Affordable study chair for students and work-from-home setups.',
      stockCount: 10,
      securityDepositPaise: 0,
      tenureTiers: [{ tenureMonths: 1, monthlyRentPaise: 50000 }],
      deliveryLeadTimeHours: 24,
    });

    productB = await Product.create({
      ...base,
      category: PRODUCT_CATEGORIES.FURNITURE,
      subcategory: 'Sofas & Seating',
      title: 'Premium Three Seat Sofa',
      description: 'Comfortable premium sofa with durable fabric upholstery.',
      stockCount: 2,
      securityDepositPaise: 500000,
      tenureTiers: [
        { tenureMonths: 1, monthlyRentPaise: 150000 },
        { tenureMonths: 12, monthlyRentPaise: 100000 },
      ],
      deliveryLeadTimeHours: 72,
    });

    productC = await Product.create({
      ...base,
      category: PRODUCT_CATEGORIES.APPLIANCES,
      subcategory: 'Refrigerators',
      title: 'Sold Out Refrigerator',
      description: 'Single door refrigerator currently out of stock at this vendor.',
      stockCount: 0,
      securityDepositPaise: 0,
      tenureTiers: [{ tenureMonths: 1, monthlyRentPaise: 300000 }],
    });

    productD = await Product.create({
      ...base,
      category: PRODUCT_CATEGORIES.APPLIANCES,
      subcategory: 'Washing Machines',
      title: 'Fast Delivery Washing Machine',
      description: 'Top load washing machine with same-day local delivery.',
      stockCount: 4,
      securityDepositPaise: 100000,
      tenureTiers: [
        { tenureMonths: 1, monthlyRentPaise: 250000 },
        { tenureMonths: 6, monthlyRentPaise: 200000 },
      ],
      deliveryLeadTimeHours: 12,
    });
  });

  describe('Derived starting rent', () => {
    it('stores the lowest tier rent as startingRentPaise', () => {
      expect(productA.startingRentPaise).toBe(50000);
      expect(productB.startingRentPaise).toBe(100000);
      expect(productD.startingRentPaise).toBe(200000);
    });
  });

  describe('Catalog listing, filters & sort', () => {
    it('returns only active, in-stock products without leaking stock internals', async () => {
      const res = await request(app).get('/api/v1/catalog');

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(3);

      const ids = res.body.data.products.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(productC.id);

      for (const product of res.body.data.products) {
        expect(product).not.toHaveProperty('stockCount');
        expect(product).toHaveProperty('availability');
        expect(Object.values(PRODUCT_AVAILABILITIES)).toContain(product.availability);
        expect(typeof product.startingRentPaise).toBe('number');
      }
    });

    it('filters by monthly price range using startingRentPaise', async () => {
      const res = await request(app).get(
        '/api/v1/catalog?minPricePaise=100000&maxPricePaise=250000'
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.products.map((p: { id: string }) => p.id).sort();
      expect(ids).toEqual([productB.id, productD.id].sort());
    });

    it('filters to zero-deposit rentals only', async () => {
      const res = await request(app).get('/api/v1/catalog?zeroDepositOnly=true');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].id).toBe(productA.id);
      expect(res.body.data.products[0].securityDepositPaise).toBe(0);
    });

    it('filters by category', async () => {
      const res = await request(app).get('/api/v1/catalog?category=appliances');

      expect(res.status).toBe(200);
      const ids = res.body.data.products.map((p: { id: string }) => p.id);
      expect(ids).toEqual([productD.id]);
    });

    it('filters by availability buckets without revealing counts', async () => {
      const limited = await request(app).get('/api/v1/catalog?availability=limited');
      expect(limited.body.data.products.map((p: { id: string }) => p.id)).toEqual([productB.id]);
      expect(limited.body.data.products[0].availability).toBe(PRODUCT_AVAILABILITIES.LIMITED);

      const inStock = await request(app).get('/api/v1/catalog?availability=in_stock');
      expect(inStock.body.data.products.map((p: { id: string }) => p.id).sort()).toEqual(
        [productA.id, productD.id].sort()
      );

      const unavailable = await request(app).get('/api/v1/catalog?availability=unavailable');
      expect(unavailable.body.data.products.map((p: { id: string }) => p.id)).toEqual([
        productC.id,
      ]);
    });

    it('sorts by price ascending', async () => {
      const res = await request(app).get('/api/v1/catalog?sort=price_asc');
      expect(res.body.data.products.map((p: { id: string }) => p.id)).toEqual([
        productA.id,
        productB.id,
        productD.id,
      ]);
    });

    it('sorts by fastest delivery', async () => {
      const res = await request(app).get('/api/v1/catalog?sort=fastest_delivery');
      expect(res.body.data.products.map((p: { id: string }) => p.id)).toEqual([
        productD.id,
        productA.id,
        productB.id,
      ]);
    });

    it('paginates with a stable sort', async () => {
      const res = await request(app).get('/api/v1/catalog?sort=price_asc&limit=1&page=2');
      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].id).toBe(productB.id);
      expect(res.body.data.pagination).toMatchObject({
        page: 2,
        limit: 1,
        total: 3,
        totalPages: 3,
      });
    });

    it('rejects an inverted price range with a validation error', async () => {
      const res = await request(app).get('/api/v1/catalog?minPricePaise=500000&maxPricePaise=100');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an invalid category value', async () => {
      const res = await request(app).get('/api/v1/catalog?category=vehicles');
      expect(res.status).toBe(400);
    });
  });

  describe('Catalog query uses indexes (explain)', () => {
    it('serves the category + price-sort query via an index scan', async () => {
      const explanation = (await Product.find({
        status: PRODUCT_STATUSES.ACTIVE,
        cityId: new mongoose.Types.ObjectId(jaipurId),
        category: PRODUCT_CATEGORIES.FURNITURE,
      })
        .sort({ startingRentPaise: 1 })
        .explain('queryPlanner')) as { queryPlanner: { winningPlan: unknown } };

      const stages = collectPlanStages(explanation.queryPlanner.winningPlan);
      expect(stages).toContain('IXSCAN');
      expect(stages).not.toContain('COLLSCAN');
    });
  });

  describe('Public product detail', () => {
    it('returns a public projection without stock internals', async () => {
      const res = await request(app).get(`/api/v1/products/${productA.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.product).not.toHaveProperty('stockCount');
      expect(res.body.data.product.availability).toBe(PRODUCT_AVAILABILITIES.IN_STOCK);
      expect(res.body.data.product.tenureTiers).toHaveLength(1);
    });

    it('hides sold-out products from the detail endpoint', async () => {
      const res = await request(app).get(`/api/v1/products/${productC.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('City serviceability', () => {
    it('reports a seeded pincode as serviceable with its city', async () => {
      const res = await request(app).get('/api/v1/cities/serviceability?pincode=302001');

      expect(res.status).toBe(200);
      expect(res.body.data.serviceable).toBe(true);
      expect(res.body.data.city.name).toBe('Jaipur');
      expect(res.body.data.requestedPincode).toBe('302001');
    });

    it('reports an unseeded pincode as not serviceable', async () => {
      const res = await request(app).get('/api/v1/cities/serviceability?pincode=110001');

      expect(res.status).toBe(200);
      expect(res.body.data.serviceable).toBe(false);
      expect(res.body.data.city).toBeNull();
    });

    it('checks serviceability by city id', async () => {
      const res = await request(app).get(`/api/v1/cities/serviceability?cityId=${jaipurId}`);
      expect(res.body.data.serviceable).toBe(true);
      expect(res.body.data.city.name).toBe('Jaipur');
    });

    it('rejects a serviceability request with no pincode or cityId', async () => {
      const res = await request(app).get('/api/v1/cities/serviceability');
      expect(res.status).toBe(400);
    });
  });

  describe('Waitlist capture for unserviceable cities', () => {
    it('captures a waitlist entry and is idempotent for the same contact', async () => {
      const first = await request(app).post('/api/v1/cities/waitlist').send({
        cityName: 'Bhopal',
        pincode: '462001',
        name: 'Aman Verma',
        email: 'Aman@Example.com',
      });

      expect(first.status).toBe(201);
      expect(first.body.data.entry.status).toBe('PENDING');
      expect(first.body.data.entry.email).toBe('aman@example.com');

      const second = await request(app).post('/api/v1/cities/waitlist').send({
        cityName: 'Bhopal',
        email: 'aman@example.com',
      });

      expect(second.status).toBe(201);
      expect(second.body.data.entry.id).toBe(first.body.data.entry.id);
      expect(await WaitlistEntry.countDocuments({ cityName: 'Bhopal' })).toBe(1);
    });

    it('requires at least one contact channel', async () => {
      const res = await request(app).post('/api/v1/cities/waitlist').send({ cityName: 'Bhopal' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
