import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { getTestMongoUri } from './global-setup.js';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Order } from '../src/models/order.model.js';
import { AuditEvent } from '../src/models/audit.model.js';
import { PlatformSettings } from '../src/models/platform-settings.model.js';
import crypto from 'crypto';
import { env } from '../src/config/env.js';
import { WebhookEvent } from '../src/models/webhook-event.model.js';
import { InventoryLock } from '../src/models/inventory-lock.model.js';
import { Product } from '../src/models/product.model.js';
import { checkoutService } from '../src/services/checkout.service.js';
import { VendorProfile } from '../src/models/vendor.model.js';
import { City } from '../src/models/city.model.js';

describe('Phase 9: Admin Console Integration Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    await mongoose.connect(getTestMongoUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Order.deleteMany({}),
      AuditEvent.deleteMany({}),
      PlatformSettings.deleteMany({}),
      WebhookEvent.deleteMany({}),
      InventoryLock.deleteMany({}),
      Product.deleteMany({}),
      VendorProfile.deleteMany({}),
      City.deleteMany({}),
    ]);
  });

  it('allows only admins to access metrics and records settings audit', async () => {
    const passwordHash = await bcrypt.hash('Password@123', 12);
    const admin = await User.create({
      email: 'admin@rentease.test',
      name: 'Admin',
      role: 'admin',
      status: 'active',
      passwordHash,
      authProviders: [{ provider: 'local', providerId: 'admin@rentease.test' }],
    });
    const renter = await User.create({
      email: 'renter@rentease.test',
      name: 'Renter',
      role: 'renter',
      status: 'active',
      passwordHash,
      authProviders: [{ provider: 'local', providerId: 'renter@rentease.test' }],
    });

    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: admin.email,
      password: 'Password@123',
    });
    const renterLogin = await request(app).post('/api/v1/auth/login').send({
      email: renter.email,
      password: 'Password@123',
    });

    const renterResponse = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${renterLogin.body.data.accessToken}`);
    expect(renterResponse.status).toBe(403);

    const metricsResponse = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.data.metrics).toMatchObject({
      checkoutInitiated: 0,
      checkoutConfirmed: 0,
      conversionPercent: 0,
      inventoryUtilizationPercent: 0,
    });

    const settingsResponse = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({ platformCommissionPercent: 12, kycWindowHours: 24, reservationTtlMinutes: 15 });
    expect(settingsResponse.status, JSON.stringify(settingsResponse.body)).toBe(200);

    const auditResponse = await request(app)
      .get('/api/v1/admin/audit')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`);
    expect(auditResponse.status).toBe(200);
    expect(
      auditResponse.body.data.events.some(
        (event: { action: string }) => event.action === 'PLATFORM_SETTINGS_UPDATED'
      )
    ).toBe(true);
  });

  it('reconciles expired inventory locks and restores stock', async () => {
    const vendorId = new mongoose.Types.ObjectId();
    const cityId = new mongoose.Types.ObjectId();
    const renterId = new mongoose.Types.ObjectId();
    const product = await Product.create({
      vendorId,
      cityId,
      category: 'furniture',
      subcategory: 'table',
      title: 'Test Table',
      description: 'A test rental table',
      specs: {},
      images: [{ publicId: 'test/table', url: 'https://res.cloudinary.com/test/table.jpg' }],
      condition: 'like_new',
      stockCount: 0,
      securityDepositPaise: 10000,
      tenureTiers: [{ tenureMonths: 1, monthlyRentPaise: 5000 }],
      deliveryLeadTimeHours: 48,
      status: 'active',
    });
    const order = await Order.create({
      renterId,
      items: [
        {
          productId: product._id,
          title: product.title,
          vendorId,
          tenureMonths: 1,
          quantity: 1,
          monthlyRentPaise: 5000,
          securityDepositPaise: 10000,
          lineTotalPaise: 15000,
        },
      ],
      deliveryAddress: {
        fullName: 'Test Renter',
        phone: '9876543210',
        line1: 'Test',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
      },
      preferredDeliveryDate: '2099-01-01',
      preferredDeliverySlot: 'morning',
      subtotalRentPaise: 5000,
      securityDepositPaise: 10000,
      totalUpfrontPaise: 15000,
      status: 'PENDING_PAYMENT',
    });
    await InventoryLock.create({
      productId: product._id,
      orderId: order._id,
      quantity: 1,
      expiresAt: new Date(Date.now() - 1000),
      released: false,
    });

    expect(await checkoutService.reconcileExpiredLocks()).toBe(1);
    expect((await Product.findById(product._id))?.stockCount).toBe(1);
  });

  it('supports vendor suspension and consolidates support disputes', async () => {
    const passwordHash = await bcrypt.hash('Password@123', 12);
    const [admin, vendorUser, renter] = await Promise.all([
      User.create({
        email: 'phase9-admin@rentease.test',
        name: 'Admin',
        role: 'admin',
        status: 'active',
        passwordHash,
        authProviders: [{ provider: 'local', providerId: 'phase9-admin@rentease.test' }],
      }),
      User.create({
        email: 'phase9-vendor@rentease.test',
        name: 'Vendor',
        role: 'vendor',
        status: 'active',
        passwordHash,
        authProviders: [{ provider: 'local', providerId: 'phase9-vendor@rentease.test' }],
      }),
      User.create({
        email: 'phase9-renter@rentease.test',
        name: 'Renter',
        role: 'renter',
        status: 'active',
        passwordHash,
        authProviders: [{ provider: 'local', providerId: 'phase9-renter@rentease.test' }],
      }),
    ]);
    const city = await City.create({
      name: 'Jaipur',
      state: 'Rajasthan',
      pincodes: ['302001'],
      isActive: true,
    });
    const vendor = await VendorProfile.create({
      userId: vendorUser._id,
      businessName: 'Phase 9 Furnishings',
      contactPhone: '9876543210',
      cityId: city._id,
      servicePincodes: ['302001'],
      verificationStatus: 'APPROVED',
    });
    await Order.create({
      renterId: renter._id,
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          title: 'Test Sofa',
          vendorId: vendor._id,
          tenureMonths: 3,
          quantity: 1,
          monthlyRentPaise: 5000,
          securityDepositPaise: 10000,
          lineTotalPaise: 25000,
        },
      ],
      deliveryAddress: {
        fullName: 'Phase 9 Renter',
        phone: '9876543210',
        line1: 'Test',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
      },
      preferredDeliveryDate: '2099-01-01',
      preferredDeliverySlot: 'morning',
      subtotalRentPaise: 5000,
      securityDepositPaise: 10000,
      totalUpfrontPaise: 15000,
      status: 'RETURNED',
      maintenanceRequests: [
        {
          description: 'The sofa frame needs a repair',
          category: 'FURNITURE',
          photos: [],
          status: 'OPEN',
          createdAt: new Date(),
        },
      ],
      damageClaim: {
        description: 'Fabric damage',
        photos: [],
        deductedPaise: 5000,
        createdAt: new Date(),
        disputed: true,
      },
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: admin.email,
      password: 'Password@123',
    });
    const headers = { Authorization: `Bearer ${login.body.data.accessToken}` };

    const suspend = await request(app)
      .patch(`/api/v1/vendors/admin/${vendor.id}/verify`)
      .set(headers)
      .send({ status: 'SUSPENDED' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.profile.verificationStatus).toBe('SUSPENDED');

    const tickets = await request(app)
      .get('/api/v1/admin/support/tickets')
      .set(headers);
    expect(tickets.status).toBe(200);
    expect(tickets.body.data.tickets).toHaveLength(2);
    expect(tickets.body.data.tickets.some((ticket: { type: string }) => ticket.type === 'MAINTENANCE')).toBe(true);
    expect(tickets.body.data.tickets.some((ticket: { type: string; disputed?: boolean }) => ticket.type === 'DAMAGE' && ticket.disputed)).toBe(true);
  });

  it('rejects invalid webhook signatures and ignores duplicate events', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_duplicate_test', order_id: 'rzp_test_order' } } },
    });
    const invalid = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', 'invalid')
      .set('Content-Type', 'application/json')
      .send(JSON.parse(payload));
    expect(invalid.status).toBe(400);

    const validSignature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    const first = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(JSON.parse(payload));
    const second = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(JSON.parse(payload));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
  });
});
