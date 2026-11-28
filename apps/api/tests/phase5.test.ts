import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getTestMongoUri } from './global-setup.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { City } from '../src/models/city.model.js';
import { VendorProfile } from '../src/models/vendor.model.js';
import { Product, IProductDocument } from '../src/models/product.model.js';
import { Cart } from '../src/models/cart.model.js';
import { Order } from '../src/models/order.model.js';
import { Address } from '../src/models/address.model.js';
import { InventoryLock } from '../src/models/inventory-lock.model.js';
import { PlatformSettings } from '../src/models/platform-settings.model.js';
import { Refund } from '../src/models/refund.model.js';
import { PaymentLedger } from '../src/models/payment-ledger.model.js';
import { WebhookEvent } from '../src/models/webhook-event.model.js';
import { AuditEvent } from '../src/models/audit.model.js';
import { emailService } from '../src/services/email.service.js';
import { cityService } from '../src/services/city.service.js';
import {
  LEDGER_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  REFUND_STATUSES,
  VENDOR_STATUSES,
} from '@rentease/shared';

const JAIPUR_PINCODE = '302001';
const RENTER_EMAIL = 'renter@rentease.test';
const ADMIN_EMAIL = 'admin@rentease.test';
const PASSWORD = 'Password@123';

// `MockEmailService` is exposed through the `IEmailService` interface; the test
// needs the mock-only inspection helpers to assert the confirmation stub fires.
const mockEmails = emailService as unknown as {
  getSentEmails(): ReadonlyArray<{ to: string; subject: string }>;
  clear(): void;
};

function dateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clientSignature(razorpayOrderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest('hex');
}

function webhookSignature(rawBody: string, secret = env.RAZORPAY_WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

interface RazorpayOrderLike {
  id: string;
  razorpayOrderId: string;
  totalUpfrontPaise: number;
}

describe('Phase 5: Razorpay Checkout & Orders', () => {
  const app = createApp();

  let cityId: mongoose.Types.ObjectId;
  let vendorId: mongoose.Types.ObjectId;
  let renterToken: string;
  let adminToken: string;

  const deliveryAddress = {
    fullName: 'Test Renter',
    phone: '9876543210',
    line1: '12 Test Street',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: JAIPUR_PINCODE,
  };

  async function seedUser(email: string, role: 'renter' | 'vendor' | 'admin') {
    return User.create({
      email,
      name: role,
      role,
      status: 'active',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      authProviders: [{ provider: 'local' }],
    });
  }

  async function login(email: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    const token = String(res.body?.data?.accessToken ?? '');
    expect(token, JSON.stringify(res.body)).not.toBe('');
    return token;
  }

  async function createProduct(
    title: string,
    options: { stock?: number; rent?: number; deposit?: number } = {}
  ): Promise<IProductDocument> {
    return Product.create({
      vendorId,
      cityId,
      category: PRODUCT_CATEGORIES.FURNITURE,
      subcategory: 'Sofas & Seating',
      title,
      description: `${title} description`,
      images: [{ publicId: `${title}-img`, url: 'https://cdn.test/img.jpg' }],
      stockCount: options.stock ?? 5,
      securityDepositPaise: options.deposit ?? 5000_00,
      tenureTiers: [{ tenureMonths: 1, monthlyRentPaise: options.rent ?? 10000_00 }],
      deliveryLeadTimeHours: 1,
      status: PRODUCT_STATUSES.ACTIVE,
    });
  }

  async function addToCart(productId: string, quantity = 1) {
    return request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${renterToken}`)
      .send({ productId, tenureMonths: 1, quantity });
  }

  /** Creates a checkout that returns the formatted order straight from the API. */
  async function checkout(): Promise<RazorpayOrderLike> {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${renterToken}`)
      .send({
        deliveryAddress,
        preferredDeliveryDate: dateInDays(4),
        preferredDeliverySlot: 'morning',
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.order as RazorpayOrderLike;
  }

  async function verifyPayment(order: RazorpayOrderLike, paymentId: string) {
    return request(app)
      .post(`/api/v1/orders/${order.id}/verify-payment`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: clientSignature(order.razorpayOrderId, paymentId),
      });
  }

  function paymentCapturedEvent(razorpayOrderId: string, paymentId: string, amountPaise: number) {
    return {
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: paymentId, order_id: razorpayOrderId, amount: amountPaise } },
      },
    };
  }

  function paymentFailedEvent(razorpayOrderId: string, paymentId: string, amountPaise: number) {
    return {
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: paymentId, order_id: razorpayOrderId, amount: amountPaise } },
      },
    };
  }

  async function postWebhook(event: unknown, options: { signature?: string } = {}) {
    const raw = JSON.stringify(event);
    return request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', options.signature ?? webhookSignature(raw))
      .send(raw);
  }

  beforeAll(async () => {
    await mongoose.connect(getTestMongoUri());
    await Promise.all([
      Cart.syncIndexes(),
      Address.syncIndexes(),
      InventoryLock.syncIndexes(),
      Refund.syncIndexes(),
      PaymentLedger.syncIndexes(),
      WebhookEvent.syncIndexes(),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    mockEmails.clear();
    await Promise.all([
      User.deleteMany({}),
      City.deleteMany({}),
      VendorProfile.deleteMany({}),
      Product.deleteMany({}),
      Cart.deleteMany({}),
      Order.deleteMany({}),
      Address.deleteMany({}),
      InventoryLock.deleteMany({}),
      PlatformSettings.deleteMany({}),
      Refund.deleteMany({}),
      WebhookEvent.deleteMany({}),
      AuditEvent.deleteMany({}),
      // The ledger is append-only, so cleanup must bypass the model middleware.
      PaymentLedger.collection.deleteMany({}),
    ]);

    await cityService.seedCities();
    const city = await City.findOne({ name: 'Jaipur' });
    cityId = city!._id;

    const vendor = await seedUser('vendor@rentease.test', 'vendor');
    const profile = await VendorProfile.create({
      userId: vendor._id,
      businessName: 'Vendor A',
      contactPhone: '9876543210',
      cityId,
      servicePincodes: [JAIPUR_PINCODE],
      verificationStatus: VENDOR_STATUSES.APPROVED,
    });
    vendorId = profile._id;

    await seedUser(RENTER_EMAIL, 'renter');
    await seedUser(ADMIN_EMAIL, 'admin');
    renterToken = await login(RENTER_EMAIL);
    adminToken = await login(ADMIN_EMAIL);
  });

  it('rejects an invalid client signature and leaves the reservation uncommitted', async () => {
    const product = await createProduct('Signature Sofa', { stock: 2 });
    await addToCart(product._id.toString());
    const order = await checkout();

    const tampered = await request(app)
      .post(`/api/v1/orders/${order.id}/verify-payment`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: 'pay_bad_signature',
        razorpay_signature: 'not-a-valid-signature',
      });
    expect(tampered.status).toBe(400);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('PENDING_PAYMENT');
    expect(reloaded?.razorpayPaymentId).toBeUndefined();

    const lock = await InventoryLock.findOne({ orderId: order.id });
    expect(lock?.committed).toBe(false);
    expect(await PaymentLedger.countDocuments({ orderId: order.id })).toBe(0);
  });

  it('rejects webhooks with an invalid signature without mutating state', async () => {
    const product = await createProduct('Webhook Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();

    const rejected = await postWebhook(
      paymentCapturedEvent(order.razorpayOrderId, 'pay_bad_hook', order.totalUpfrontPaise),
      { signature: 'deadbeef' }
    );
    expect(rejected.status).toBe(400);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('PENDING_PAYMENT');
    expect(await PaymentLedger.countDocuments({ orderId: order.id })).toBe(0);
  });

  it('settles a captured payment exactly once and ignores duplicate webhooks', async () => {
    const product = await createProduct('Duplicate Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    const paymentId = 'pay_duplicate_1';
    const event = paymentCapturedEvent(order.razorpayOrderId, paymentId, order.totalUpfrontPaise);

    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ received: true });
    expect(first.body.data.duplicate).toBeUndefined();

    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('PENDING_KYC');
    expect(reloaded?.razorpayPaymentId).toBe(paymentId);

    const entries = await PaymentLedger.find({ orderId: order.id });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.type).sort()).toEqual(
      [LEDGER_ENTRY_TYPES.DEPOSIT, LEDGER_ENTRY_TYPES.RENT].sort()
    );
    expect(entries.every((entry) => entry.direction === LEDGER_DIRECTIONS.DEBIT)).toBe(true);

    const lock = await InventoryLock.findOne({ orderId: order.id });
    expect(lock?.committed).toBe(true);
    expect(mockEmails.getSentEmails().some((mail) => mail.to === RENTER_EMAIL)).toBe(true);
  });

  it('refuses a captured amount that does not match the order total', async () => {
    const product = await createProduct('Tampered Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();

    const tampered = await postWebhook(
      paymentCapturedEvent(order.razorpayOrderId, 'pay_tampered', order.totalUpfrontPaise + 100)
    );
    expect(tampered.status).toBe(200);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('PENDING_PAYMENT');
    expect(await PaymentLedger.countDocuments({ orderId: order.id })).toBe(0);

    const lock = await InventoryLock.findOne({ orderId: order.id });
    expect(lock?.committed).toBe(false);
  });

  it('returns reserved stock when a payment fails', async () => {
    const product = await createProduct('Failing Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    expect((await Product.findById(product._id))?.stockCount).toBe(0);

    const failed = await postWebhook(
      paymentFailedEvent(order.razorpayOrderId, 'pay_failed', order.totalUpfrontPaise)
    );
    expect(failed.status).toBe(200);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('CANCELLED');
    expect((await Product.findById(product._id))?.stockCount).toBe(1);
    const lock = await InventoryLock.findOne({ orderId: order.id });
    expect(lock?.released).toBe(true);
  });

  it('never resurrects a cancelled order from a late capture', async () => {
    const product = await createProduct('Late Sofa', { stock: 2 });
    await addToCart(product._id.toString());
    const order = await checkout();

    const cancelled = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.order.status).toBe('CANCELLED');
    expect((await Product.findById(product._id))?.stockCount).toBe(2);

    // A capture for the cancelled order arrives late: it must be ignored.
    const late = await postWebhook(
      paymentCapturedEvent(order.razorpayOrderId, 'pay_late', order.totalUpfrontPaise)
    );
    expect(late.status).toBe(200);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.razorpayPaymentId).toBeUndefined();
    expect((await Product.findById(product._id))?.stockCount).toBe(2);
    expect(await PaymentLedger.countDocuments({ orderId: order.id })).toBe(0);
  });

  it('resumes payment without double-locking stock and refuses after expiry', async () => {
    const product = await createProduct('Resume Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();

    const resumed = await request(app)
      .post(`/api/v1/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.keyId).toBe(env.RAZORPAY_KEY_ID);
    // The original gateway order is reused, so stock is never locked twice.
    expect(resumed.body.data.order.razorpayOrderId).toBe(order.razorpayOrderId);
    expect((await Product.findById(product._id))?.stockCount).toBe(0);
    expect(await InventoryLock.countDocuments({ orderId: order.id })).toBe(1);

    const lock = await InventoryLock.findOne({ orderId: order.id });
    lock!.expiresAt = new Date(Date.now() - 1000);
    await lock!.save();

    const expired = await request(app)
      .post(`/api/v1/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({});
    expect(expired.status).toBe(409);
  });

  it('issues a full refund that closes the order and credits the ledger', async () => {
    const product = await createProduct('Refund Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();

    const verified = await verifyPayment(order, 'pay_refund_full');
    expect(verified.status).toBe(200);
    expect(verified.body.data.order.status).toBe('PENDING_KYC');

    const refund = await request(app)
      .post(`/api/v1/orders/admin/${order.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Renter cancelled before delivery' });
    expect(refund.status, JSON.stringify(refund.body)).toBe(201);
    expect(refund.body.data.refund.status).toBe(REFUND_STATUSES.PROCESSED);
    expect(refund.body.data.refund.amountPaise).toBe(order.totalUpfrontPaise);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('REFUNDED');
    expect((await Product.findById(product._id))?.stockCount).toBe(1);

    const refundEntries = await PaymentLedger.find({
      orderId: order.id,
      type: LEDGER_ENTRY_TYPES.REFUND,
    });
    expect(refundEntries).toHaveLength(1);
    expect(refundEntries[0].direction).toBe(LEDGER_DIRECTIONS.CREDIT);
    expect(refundEntries[0].amountPaise).toBe(order.totalUpfrontPaise);
  });

  it('supports partial refunds without closing the order', async () => {
    const product = await createProduct('Partial Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    await verifyPayment(order, 'pay_refund_partial');

    const partial = await request(app)
      .post(`/api/v1/orders/admin/${order.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountPaise: 2000_00, reason: 'Goodwill credit' });
    expect(partial.status).toBe(201);
    expect(partial.body.data.refund.amountPaise).toBe(2000_00);

    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('PENDING_KYC');
    expect((await Product.findById(product._id))?.stockCount).toBe(0);

    // Refunding more than the outstanding balance is refused.
    const over = await request(app)
      .post(`/api/v1/orders/admin/${order.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountPaise: order.totalUpfrontPaise, reason: 'Too much' });
    expect(over.status).toBe(400);

    // A second refund of the remaining balance is allowed and closes the order.
    const rest = await request(app)
      .post(`/api/v1/orders/admin/${order.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Refund the balance' });
    expect(rest.status).toBe(201);
    expect(rest.body.data.refund.amountPaise).toBe(order.totalUpfrontPaise - 2000_00);

    const settled = await Order.findById(order.id);
    expect(settled?.status).toBe('REFUNDED');
    expect(
      await PaymentLedger.countDocuments({ orderId: order.id, type: LEDGER_ENTRY_TYPES.REFUND })
    ).toBe(2);
  });

  it('reconciles a gateway refund.processed event against the stored record', async () => {
    const product = await createProduct('Reconcile Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    const verified = await verifyPayment(order, 'pay_reconcile');
    const paymentId = verified.body.data.order.razorpayPaymentId as string;

    const refund = await Refund.create({
      orderId: order.id,
      razorpayPaymentId: paymentId,
      amountPaise: order.totalUpfrontPaise,
      reason: 'Issued out-of-band',
      status: REFUND_STATUSES.PENDING,
      razorpayRefundId: 'rfnd_manual_1',
    });

    const res = await postWebhook({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: { id: 'rfnd_manual_1', payment_id: paymentId, amount: order.totalUpfrontPaise },
        },
      },
    });
    expect(res.status).toBe(200);

    const reconciled = await Refund.findById(refund._id);
    expect(reconciled?.status).toBe(REFUND_STATUSES.PROCESSED);
    const reloaded = await Order.findById(order.id);
    expect(reloaded?.status).toBe('REFUNDED');
    expect(
      await PaymentLedger.countDocuments({ orderId: order.id, type: LEDGER_ENTRY_TYPES.REFUND })
    ).toBe(1);
  });

  it('restricts the refund action to admins', async () => {
    const product = await createProduct('Admin Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    await verifyPayment(order, 'pay_admin_guard');

    const forbidden = await request(app)
      .post(`/api/v1/orders/admin/${order.id}/refund`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({ reason: 'Renter cannot refund' });
    expect(forbidden.status).toBe(403);
  });

  it('exposes the order money trail to admins only', async () => {
    const product = await createProduct('Trail Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    await verifyPayment(order, 'pay_trail');
    await request(app)
      .post(`/api/v1/orders/admin/${order.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Trail refund' });

    const trail = await request(app)
      .get(`/api/v1/orders/admin/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(trail.status).toBe(200);
    expect(trail.body.data.ledger).toHaveLength(3);
    expect(trail.body.data.refunds).toHaveLength(1);
    expect(trail.body.data.refunds[0].amountPaise).toBe(order.totalUpfrontPaise);

    const forbidden = await request(app)
      .get(`/api/v1/orders/admin/${order.id}/payments`)
      .set('Authorization', `Bearer ${renterToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('keeps the payment ledger append-only', async () => {
    const product = await createProduct('Immutable Sofa', { stock: 1 });
    await addToCart(product._id.toString());
    const order = await checkout();
    await verifyPayment(order, 'pay_immutable');
    expect(await PaymentLedger.countDocuments({ orderId: order.id })).toBe(2);

    await expect(
      PaymentLedger.updateOne({ orderId: order.id }, { $set: { amountPaise: 1 } })
    ).rejects.toThrow(/immutable/i);
    await expect(PaymentLedger.deleteMany({ orderId: order.id })).rejects.toThrow(/immutable/i);

    expect(await PaymentLedger.countDocuments({ orderId: order.id })).toBe(2);
  });
});
