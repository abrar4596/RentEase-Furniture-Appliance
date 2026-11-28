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
import { checkoutService } from '../src/services/checkout.service.js';
import { cityService } from '../src/services/city.service.js';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
  calculateUpfrontDue,
} from '@rentease/shared';

const JAIPUR_PINCODE = '302001';

function dateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('Phase 4: Cart, Inventory Locking & Delivery Scheduling', () => {
  const app = createApp();

  let cityId: mongoose.Types.ObjectId;
  let vendorAId: mongoose.Types.ObjectId;
  let vendorBId: mongoose.Types.ObjectId;
  let renterToken: string;
  let renterId: string;

  const deliveryAddress = {
    fullName: 'Test Renter',
    phone: '9876543210',
    line1: '12 Test Street',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: JAIPUR_PINCODE,
  };

  async function createVendor(businessName: string, email: string) {
    const user = await User.create({
      email,
      name: businessName,
      role: 'vendor',
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });
    const profile = await VendorProfile.create({
      userId: user._id,
      businessName,
      contactPhone: '9876543210',
      cityId,
      servicePincodes: [JAIPUR_PINCODE],
      verificationStatus: VENDOR_STATUSES.APPROVED,
    });
    return profile._id;
  }

  async function createProduct(
    vendorId: mongoose.Types.ObjectId,
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

  async function addToCart(token: string, productId: string, quantity = 1) {
    return request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, tenureMonths: 1, quantity });
  }

  async function checkout(token: string, date = dateInDays(4), slot = 'morning') {
    return request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress,
        preferredDeliveryDate: date,
        preferredDeliverySlot: slot,
      });
  }

  beforeAll(async () => {
    await mongoose.connect(getTestMongoUri());
    await Promise.all([Cart.syncIndexes(), Address.syncIndexes(), InventoryLock.syncIndexes()]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
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
    ]);

    await cityService.seedCities();
    const city = await City.findOne({ name: 'Jaipur' });
    cityId = city!._id;

    vendorAId = await createVendor('Vendor A', 'vendor.a@rentease.test');
    vendorBId = await createVendor('Vendor B', 'vendor.b@rentease.test');

    const renter = await User.create({
      email: 'renter@rentease.test',
      name: 'Renter',
      role: 'renter',
      status: 'active',
      passwordHash: await bcrypt.hash('Password@123', 4),
      authProviders: [{ provider: 'local' }],
    });
    renterId = renter._id.toString();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'renter@rentease.test', password: 'Password@123' });
    renterToken = String(login.body?.data?.accessToken ?? '');
    expect(renterToken, JSON.stringify(login.body)).not.toBe('');
  });

  it('recomputes cart totals server-side and groups items per vendor', async () => {
    const productA = await createProduct(vendorAId, 'Sofa A', { rent: 10000_00, deposit: 5000_00 });
    const productB = await createProduct(vendorBId, 'Fridge B', { rent: 20000_00, deposit: 0 });

    await addToCart(renterToken, productA._id.toString(), 2);
    await addToCart(renterToken, productB._id.toString(), 1);

    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${renterToken}`);
    expect(res.status).toBe(200);

    const cart = res.body.data.cart;
    expect(cart.items).toHaveLength(2);
    expect(cart.vendorGroups).toHaveLength(2);
    expect(cart.totals).toMatchObject({
      itemCount: 2,
      unitCount: 3,
      subtotalRentPaise: 10000_00 * 2 + 20000_00,
      securityDepositPaise: 5000_00 * 2,
    });
    expect(cart.totals.totalUpfrontPaise).toBe(calculateUpfrontDue(40000_00, 10000_00));

    const sofaGroup = cart.vendorGroups.find(
      (group: { vendorId: string }) => group.vendorId === vendorAId.toString()
    );
    expect(sofaGroup.subtotalRentPaise).toBe(20000_00);
    expect(sofaGroup.totalUpfrontPaise).toBe(calculateUpfrontDue(20000_00, 10000_00));
  });

  it('reflects live catalogue price changes on the next read', async () => {
    const product = await createProduct(vendorAId, 'Chair', { rent: 10000_00, deposit: 0 });
    await addToCart(renterToken, product._id.toString(), 2);

    await Product.updateOne(
      { _id: product._id },
      { $set: { 'tenureTiers.0.monthlyRentPaise': 15000_00 } }
    );

    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${renterToken}`);
    expect(res.body.data.cart.totals.subtotalRentPaise).toBe(30000_00);
    expect(res.body.data.cart.items[0].monthlyRentPaise).toBe(15000_00);
  });

  it('supports an anonymous device cart and merges it into the user cart on login', async () => {
    const product = await createProduct(vendorAId, 'Lamp', { stock: 4 });
    const agent = request.agent(app);

    const added = await agent
      .post('/api/v1/cart/items')
      .send({ productId: product._id.toString(), tenureMonths: 1, quantity: 1 });
    expect(added.status).toBe(200);
    expect(added.body.data.cart.guestId).toBeTruthy();

    const guestCartBefore = await agent.get('/api/v1/cart');
    expect(guestCartBefore.body.data.cart.items).toHaveLength(1);

    const renamedRenter = await User.create({
      email: 'guest.merger@rentease.test',
      name: 'Guest Merger',
      role: 'renter',
      status: 'active',
      passwordHash: await bcrypt.hash('Password@123', 4),
      authProviders: [{ provider: 'local' }],
    });

    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'guest.merger@rentease.test', password: 'Password@123' });
    expect(login.status).toBe(200);

    const mergedCart = await agent
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(mergedCart.body.data.cart.items).toHaveLength(1);
    expect(mergedCart.body.data.cart.userId).toBe(renamedRenter._id.toString());

    // The anonymous cart is consumed by the merge.
    expect(await Cart.countDocuments({ guestId: { $exists: true } })).toBe(0);
  });

  it('prevents two simultaneous checkouts from overselling a single unit', async () => {
    const product = await createProduct(vendorAId, 'Rare Sofa', { stock: 1 });
    await addToCart(renterToken, product._id.toString(), 1);

    const [first, second] = await Promise.all([checkout(renterToken), checkout(renterToken)]);
    const statuses = [first.status, second.status].sort();
    const successes = statuses.filter((status) => status === 201);

    expect(successes).toHaveLength(1);
    expect(statuses.some((status) => status >= 400)).toBe(true);

    const after = await Product.findById(product._id);
    expect(after?.stockCount).toBe(0);
  });

  it('returns stock when an unpaid reservation expires', async () => {
    const product = await createProduct(vendorAId, 'Expiring Sofa', { stock: 1 });
    await addToCart(renterToken, product._id.toString(), 1);

    const created = await checkout(renterToken);
    expect(created.status).toBe(201);
    expect((await Product.findById(product._id))?.stockCount).toBe(0);

    const lock = await InventoryLock.findOne({ released: false });
    expect(lock?.committed).toBe(false);
    lock!.expiresAt = new Date(Date.now() - 1000);
    await lock!.save();

    const reconciled = await checkoutService.reconcileExpiredLocks();
    expect(reconciled).toBe(1);
    expect((await Product.findById(product._id))?.stockCount).toBe(1);

    const finalized = await InventoryLock.findById(lock!._id);
    expect(finalized?.released).toBe(true);
    expect(finalized?.purgeAt).toBeInstanceOf(Date);
  });

  it('never sweeps a committed (paid) reservation', async () => {
    const product = await createProduct(vendorAId, 'Paid Sofa', { stock: 1 });
    await addToCart(renterToken, product._id.toString(), 1);

    const created = await checkout(renterToken);
    const order = created.body.data.order;
    const paymentId = 'pay_test_123';
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${order.razorpayOrderId}|${paymentId}`)
      .digest('hex');

    const verified = await request(app)
      .post(`/api/v1/orders/${order.id}/verify-payment`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });
    expect(verified.status).toBe(200);
    expect(verified.body.data.order.status).toBe('PENDING_KYC');

    const lock = await InventoryLock.findOne({ released: false });
    expect(lock?.committed).toBe(true);
    lock!.expiresAt = new Date(Date.now() - 1000);
    await lock!.save();

    expect(await checkoutService.reconcileExpiredLocks()).toBe(0);
    expect((await Product.findById(product._id))?.stockCount).toBe(0);
  });

  it('exposes delivery slot availability with blackout and capacity rules', async () => {
    const date = dateInDays(4);

    const base = await request(app)
      .get('/api/v1/cart/delivery/slots')
      .query({ pincode: JAIPUR_PINCODE, date })
      .set('Authorization', `Bearer ${renterToken}`);
    expect(base.status).toBe(200);
    expect(base.body.data.slots.slots).toHaveLength(3);
    expect(base.body.data.slots.slots.every((s: { available: boolean }) => s.available)).toBe(true);

    // Unserviceable pincode is rejected outright.
    const unserviceable = await request(app)
      .get('/api/v1/cart/delivery/slots')
      .query({ pincode: '999999', date })
      .set('Authorization', `Bearer ${renterToken}`);
    expect(unserviceable.status).toBe(400);

    // Blackout date disables every slot.
    await PlatformSettings.create({ blackoutDates: [date] });
    const blackout = await request(app)
      .get('/api/v1/cart/delivery/slots')
      .query({ pincode: JAIPUR_PINCODE, date })
      .set('Authorization', `Bearer ${renterToken}`);
    expect(blackout.body.data.slots.blackout).toBe(true);
    expect(blackout.body.data.slots.slots.every((s: { available: boolean }) => !s.available)).toBe(
      true
    );
    await PlatformSettings.deleteMany({});

    // Capacity of one: a single committed order fills the morning slot.
    await PlatformSettings.create({ deliverySlotCapacity: 1 });
    const product = await createProduct(vendorAId, 'Slot Sofa', { stock: 3 });
    await addToCart(renterToken, product._id.toString(), 1);
    const booked = await checkout(renterToken, date, 'morning');
    expect(booked.status).toBe(201);

    const capped = await request(app)
      .get('/api/v1/cart/delivery/slots')
      .query({ pincode: JAIPUR_PINCODE, date })
      .set('Authorization', `Bearer ${renterToken}`);
    const morning = capped.body.data.slots.slots.find(
      (s: { slot: string }) => s.slot === 'morning'
    );
    const afternoon = capped.body.data.slots.slots.find(
      (s: { slot: string }) => s.slot === 'afternoon'
    );
    expect(morning.available).toBe(false);
    expect(afternoon.available).toBe(true);
  });

  it('manages the renter address book and validates pincodes against the service zone', async () => {
    const first = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${renterToken}`)
      .send({ ...deliveryAddress, label: 'Home' });
    expect(first.status).toBe(201);
    expect(first.body.data.address.isDefault).toBe(true);

    const second = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${renterToken}`)
      .send({ ...deliveryAddress, pincode: '302002', label: 'Office', isDefault: true });
    expect(second.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${renterToken}`);
    expect(list.body.data.addresses).toHaveLength(2);
    expect(list.body.data.addresses[0].id).toBe(second.body.data.address.id);
    expect(
      list.body.data.addresses.filter((a: { isDefault: boolean }) => a.isDefault)
    ).toHaveLength(1);

    const rejected = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${renterToken}`)
      .send({ ...deliveryAddress, pincode: '999999' });
    expect(rejected.status).toBe(400);

    const updated = await request(app)
      .patch(`/api/v1/addresses/${first.body.data.address.id}`)
      .set('Authorization', `Bearer ${renterToken}`)
      .send({ line1: '99 Updated Road' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.address.line1).toBe('99 Updated Road');

    // Deleting the default promotes another address so one always remains default.
    const removed = await request(app)
      .delete(`/api/v1/addresses/${second.body.data.address.id}`)
      .set('Authorization', `Bearer ${renterToken}`);
    expect(removed.status).toBe(200);
    const remaining = await Address.find({ userId: new mongoose.Types.ObjectId(renterId) });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
  });
});
