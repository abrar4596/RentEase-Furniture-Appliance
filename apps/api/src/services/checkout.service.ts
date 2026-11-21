import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  DeliveryAddress,
  IOrder,
  ORDER_STATES,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
  assertValidOrderTransition,
  calculateUpfrontDue,
} from '@rentease/shared';
import { env } from '../config/env.js';
import { Cart } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { Order, formatOrder } from '../models/order.model.js';
import { InventoryLock } from '../models/inventory-lock.model.js';
import {
  ConflictError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '../middleware/error-handler.js';
import { VendorLedger } from '../models/vendor-ledger.model.js';
import { PlatformSettings } from '../models/platform-settings.model.js';

async function createRazorpayOrder(amountPaise: number, receipt: string): Promise<string> {
  const canCallApi =
    env.RAZORPAY_KEY_ID.startsWith('rzp_') &&
    !env.RAZORPAY_KEY_ID.includes('placeholder') &&
    !env.RAZORPAY_KEY_SECRET.includes('placeholder');
  if (!canCallApi) return `rzp_test_order_${crypto.randomBytes(8).toString('hex')}`;

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  });
  if (!response.ok) throw new Error('Razorpay order creation failed');
  const data = (await response.json()) as { id: string };
  return data.id;
}

function timingSafeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export class CheckoutService {
  public async createCheckout(
    userId: string,
    input: {
      deliveryAddress: DeliveryAddress;
      preferredDeliveryDate: string;
      preferredDeliverySlot: 'morning' | 'afternoon' | 'evening';
    }
  ): Promise<{ order: IOrder; keyId: string }> {
    const settings = await PlatformSettings.findOne();
    const reservationTtlMinutes = settings?.reservationTtlMinutes || env.RESERVATION_TTL_MINUTES;
    const cart = await Cart.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!cart || cart.items.length === 0) throw new ValidationError('Your cart is empty');

    const date = new Date(`${input.preferredDeliveryDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime()) || date < today) {
      throw new ValidationError('Preferred delivery date must be today or in the future');
    }

    const orderItems: Array<{
      productId: mongoose.Types.ObjectId;
      title: string;
      vendorId: mongoose.Types.ObjectId;
      tenureMonths: number;
      quantity: number;
      monthlyRentPaise: number;
      securityDepositPaise: number;
      lineTotalPaise: number;
    }> = [];
    let subtotalRentPaise = 0;
    let securityDepositPaise = 0;
    const lockedProducts: Array<{ productId: mongoose.Types.ObjectId; quantity: number }> = [];

    try {
      for (const item of cart.items) {
        const product = await Product.findOne({
          _id: item.productId,
          status: PRODUCT_STATUSES.ACTIVE,
          stockCount: { $gte: item.quantity },
        });
        if (!product) throw new ConflictError('One or more items are unavailable or out of stock');

        const vendor = await VendorProfile.findById(product.vendorId);
        if (!vendor || vendor.verificationStatus !== VENDOR_STATUSES.APPROVED) {
          throw new ConflictError('One or more items are from an unverified vendor');
        }
        const tier = product.tenureTiers.find((entry) => entry.tenureMonths === item.tenureMonths);
        if (!tier) throw new ValidationError(`Tenure ${item.tenureMonths} months is unavailable`);

        const locked = await Product.findOneAndUpdate(
          {
            _id: product._id,
            status: PRODUCT_STATUSES.ACTIVE,
            stockCount: { $gte: item.quantity },
          },
          { $inc: { stockCount: -item.quantity } },
          { new: true }
        );
        if (!locked) throw new ConflictError('Stock changed while checking out');
        lockedProducts.push({ productId: product._id, quantity: item.quantity });

        const lineRent = tier.monthlyRentPaise * item.quantity;
        const lineDeposit = product.securityDepositPaise * item.quantity;
        subtotalRentPaise += lineRent;
        securityDepositPaise += lineDeposit;
        orderItems.push({
          productId: product._id,
          title: product.title,
          vendorId: product.vendorId,
          tenureMonths: item.tenureMonths,
          quantity: item.quantity,
          monthlyRentPaise: tier.monthlyRentPaise,
          securityDepositPaise: product.securityDepositPaise,
          lineTotalPaise: lineRent + lineDeposit,
        });
      }

      const totalUpfrontPaise = calculateUpfrontDue(subtotalRentPaise, securityDepositPaise);
      const provisional = await Order.create({
        renterId: userId,
        items: orderItems,
        deliveryAddress: input.deliveryAddress,
        preferredDeliveryDate: input.preferredDeliveryDate,
        preferredDeliverySlot: input.preferredDeliverySlot,
        subtotalRentPaise,
        securityDepositPaise,
        totalUpfrontPaise,
        status: ORDER_STATES.PENDING_PAYMENT,
      });
      const razorpayOrderId = await createRazorpayOrder(
        totalUpfrontPaise,
        `rentease_${provisional._id}`
      );
      provisional.razorpayOrderId = razorpayOrderId;
      await provisional.save();

      await InventoryLock.insertMany(
        lockedProducts.map((lock) => ({
          productId: lock.productId,
          orderId: provisional._id,
          quantity: lock.quantity,
          expiresAt: new Date(Date.now() + reservationTtlMinutes * 60 * 1000),
        }))
      );
      await Cart.findByIdAndUpdate(cart._id, { $set: { items: [] } });
      return { order: formatOrder(provisional), keyId: env.RAZORPAY_KEY_ID };
    } catch (error) {
      for (const lock of lockedProducts) {
        await Product.findByIdAndUpdate(lock.productId, { $inc: { stockCount: lock.quantity } });
      }
      throw error;
    }
  }

  public async verifyPayment(
    userId: string,
    input: {
      orderId: string;
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }
  ): Promise<IOrder> {
    const order = await Order.findById(input.orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot verify this order');
    if (order.razorpayOrderId !== input.razorpay_order_id)
      throw new ValidationError('Razorpay order mismatch');

    const payload = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');
    if (!timingSafeEqual(input.razorpay_signature, expected)) {
      throw new ValidationError('Invalid Razorpay payment signature');
    }

    assertValidOrderTransition(order.status, ORDER_STATES.PENDING_KYC);
    order.status = ORDER_STATES.PENDING_KYC;
    order.razorpayPaymentId = input.razorpay_payment_id;
    order.razorpaySignature = input.razorpay_signature;
    await order.save();
    await InventoryLock.updateMany(
      { orderId: order._id, released: false },
      { $set: { released: false, expiresAt: new Date('2099-01-01') } }
    );
    return formatOrder(order);
  }

  public async getOrders(userId: string): Promise<IOrder[]> {
    const orders = await Order.find({ renterId: new mongoose.Types.ObjectId(userId) }).sort({
      createdAt: -1,
    });
    return orders.map(formatOrder);
  }

  public async getVendorOrders(userId: string): Promise<IOrder[]> {
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!profile) throw new NotFoundError('Vendor profile not found');

    const orders = await Order.find({
      'items.vendorId': profile._id,
      status: {
        $in: [
          ORDER_STATES.CONFIRMED,
          ORDER_STATES.OUT_FOR_DELIVERY,
          ORDER_STATES.ACTIVE,
          ORDER_STATES.RETURN_REQUESTED,
        ],
      },
    }).sort({ createdAt: -1 });
    return orders.map(formatOrder);
  }

  public async updateVendorOrderStatus(
    userId: string,
    orderId: string,
    nextStatus: typeof ORDER_STATES.OUT_FOR_DELIVERY | typeof ORDER_STATES.ACTIVE
  ): Promise<IOrder> {
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!profile) throw new NotFoundError('Vendor profile not found');

    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    const ownsItem = order.items.some(
      (item) => item.vendorId.toString() === profile._id.toString()
    );
    if (!ownsItem) throw new ForbiddenError('You cannot fulfill this order');

    assertValidOrderTransition(order.status, nextStatus);
    order.status = nextStatus;
    if (nextStatus === ORDER_STATES.ACTIVE) {
      const start = new Date();
      order.rentalStartAt = start;
      const end = new Date(start);
      const tenureMonths = order.items.length
        ? Math.max(...order.items.map((item) => item.tenureMonths))
        : 1;
      end.setMonth(end.getMonth() + tenureMonths);
      order.rentalEndAt = end;
    }
    await order.save();
    return formatOrder(order);
  }

  public async getOrder(userId: string, orderId: string): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot view this order');
    return formatOrder(order);
  }

  public async cancelOrder(userId: string, orderId: string): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot cancel this order');
    assertValidOrderTransition(order.status, ORDER_STATES.CANCELLED);
    order.status = ORDER_STATES.CANCELLED;
    await order.save();

    const locks = await InventoryLock.find({ orderId: order._id, released: false });
    for (const lock of locks) {
      await Product.findByIdAndUpdate(lock.productId, { $inc: { stockCount: lock.quantity } });
      lock.released = true;
      await lock.save();
    }
    return formatOrder(order);
  }

  public async releaseOrderLocks(orderId: string): Promise<void> {
    const order = await Order.findById(orderId);
    if (!order) return;
    const locks = await InventoryLock.find({ orderId: order._id, released: false });
    for (const lock of locks) {
      await Product.findByIdAndUpdate(lock.productId, { $inc: { stockCount: lock.quantity } });
      lock.released = true;
      await lock.save();
    }
  }

  public async reconcileExpiredLocks(): Promise<number> {
    const expiredLocks = await InventoryLock.find({
      released: false,
      expiresAt: { $lt: new Date() },
    });
    let reconciled = 0;
    for (const lock of expiredLocks) {
      const order = await Order.findById(lock.orderId);
      if (!order || order.status !== ORDER_STATES.PENDING_PAYMENT) continue;
      await Product.findByIdAndUpdate(lock.productId, { $inc: { stockCount: lock.quantity } });
      lock.released = true;
      await lock.save();
      reconciled += lock.quantity;
    }
    return reconciled;
  }

  public async submitKyc(
    userId: string,
    orderId: string,
    input: {
      documentType: 'AADHAR' | 'PAN' | 'DL' | 'PASSPORT' | 'VOTER_ID';
      documentNumber: string;
      frontDocument: { publicId: string; url: string };
      backDocument?: { publicId: string; url: string };
    }
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot submit KYC for this order');
    if (order.status !== ORDER_STATES.PENDING_KYC && order.status !== ORDER_STATES.KYC_REJECTED) {
      throw new ValidationError('KYC can only be submitted for a pending or rejected order');
    }

    order.kyc = {
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      frontDocument: input.frontDocument,
      backDocument: input.backDocument,
      submittedAt: new Date(),
    };
    if (order.status === ORDER_STATES.KYC_REJECTED) {
      assertValidOrderTransition(order.status, ORDER_STATES.PENDING_KYC);
      order.status = ORDER_STATES.PENDING_KYC;
    }
    await order.save();
    return formatOrder(order);
  }

  public async adminListPendingKyc(): Promise<IOrder[]> {
    const orders = await Order.find({
      status: ORDER_STATES.PENDING_KYC,
      kyc: { $exists: true },
    }).sort({ 'kyc.submittedAt': 1 });
    return orders.map(formatOrder);
  }

  public async adminReviewKyc(
    adminUserId: string,
    orderId: string,
    input: { decision: 'APPROVED' | 'REJECTED'; rejectionReason?: string }
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.status !== ORDER_STATES.PENDING_KYC || !order.kyc) {
      throw new ValidationError('This order does not have KYC pending review');
    }

    order.kyc.reviewedAt = new Date();
    order.kyc.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
    order.kyc.rejectionReason = input.decision === 'REJECTED' ? input.rejectionReason : undefined;
    assertValidOrderTransition(
      order.status,
      input.decision === 'APPROVED' ? ORDER_STATES.CONFIRMED : ORDER_STATES.KYC_REJECTED
    );
    order.status =
      input.decision === 'APPROVED' ? ORDER_STATES.CONFIRMED : ORDER_STATES.KYC_REJECTED;
    await order.save();
    if (input.decision === 'APPROVED') {
      const platformSettings = await PlatformSettings.findOne();
      const commissionPercent =
        platformSettings?.platformCommissionPercent ?? env.PLATFORM_COMMISSION_PERCENT;
      const byVendor = new Map<string, number>();
      for (const item of order.items) {
        const key = item.vendorId.toString();
        byVendor.set(key, (byVendor.get(key) || 0) + item.monthlyRentPaise * item.quantity);
      }
      for (const [vendorId, grossRentPaise] of byVendor) {
        const commissionPaise = Math.round((grossRentPaise * commissionPercent) / 100);
        await VendorLedger.findOneAndUpdate(
          { vendorId: new mongoose.Types.ObjectId(vendorId), orderId: order._id },
          {
            $setOnInsert: {
              grossRentPaise,
              commissionPercent,
              commissionPaise,
              netPayablePaise: grossRentPaise - commissionPaise,
              status: 'PENDING',
            },
          },
          { upsert: true, new: true }
        );
      }
    }
    return formatOrder(order);
  }

  public async addMaintenanceRequest(
    userId: string,
    orderId: string,
    input: { description: string; photos: Array<{ publicId: string; url: string }> }
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot update this order');
    if (order.status !== ORDER_STATES.ACTIVE)
      throw new ValidationError('Maintenance is available only for active rentals');
    order.maintenanceRequests.push({
      _id: new mongoose.Types.ObjectId(),
      description: input.description,
      photos: input.photos,
      status: 'OPEN',
      createdAt: new Date(),
    });
    await order.save();
    return formatOrder(order);
  }

  public async extendTenure(
    userId: string,
    orderId: string,
    additionalMonths: number
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot update this order');
    if (order.status !== ORDER_STATES.ACTIVE)
      throw new ValidationError('Tenure can be extended only for active rentals');
    if (!order.rentalEndAt) throw new ValidationError('Rental end date is missing');
    const end = new Date(order.rentalEndAt);
    end.setMonth(end.getMonth() + additionalMonths);
    order.rentalEndAt = end;
    await order.save();
    return formatOrder(order);
  }

  public async requestReturn(
    userId: string,
    orderId: string,
    input: { preferredPickupDate: string; reason?: string }
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot update this order');
    if (order.status !== ORDER_STATES.ACTIVE)
      throw new ValidationError('Return can be requested only for active rentals');
    if (order.returnRequest) throw new ConflictError('A return request already exists');
    assertValidOrderTransition(order.status, ORDER_STATES.RETURN_REQUESTED);
    order.status = ORDER_STATES.RETURN_REQUESTED;
    order.returnRequest = {
      requestedAt: new Date(),
      preferredPickupDate: input.preferredPickupDate,
      reason: input.reason,
    };
    await order.save();
    return formatOrder(order);
  }

  public async completeReturn(
    userId: string,
    orderId: string,
    input: {
      damageDescription?: string;
      damagePhotos: Array<{ publicId: string; url: string }>;
      damageDeductionPaise: number;
    }
  ): Promise<IOrder> {
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!profile) throw new NotFoundError('Vendor profile not found');
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.items.some((item) => item.vendorId.toString() === profile._id.toString())) {
      throw new ForbiddenError('You cannot complete this return');
    }
    if (order.status !== ORDER_STATES.RETURN_REQUESTED) {
      throw new ValidationError('Return must be in RETURN_REQUESTED state');
    }

    assertValidOrderTransition(order.status, ORDER_STATES.RETURNED);
    order.status = ORDER_STATES.RETURNED;
    if (order.returnRequest) order.returnRequest.returnedAt = new Date();
    if (
      input.damageDescription ||
      input.damagePhotos.length > 0 ||
      input.damageDeductionPaise > 0
    ) {
      if (input.damageDeductionPaise > order.securityDepositPaise) {
        throw new ValidationError('Damage deduction cannot exceed the security deposit');
      }
      order.damageClaim = {
        description: input.damageDescription || 'Damage recorded upon return',
        photos: input.damagePhotos,
        deductedPaise: input.damageDeductionPaise,
        createdAt: new Date(),
      };
    }
    await order.save();
    for (const item of order.items) {
      if (item.vendorId.toString() === profile._id.toString()) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { stockCount: item.quantity } });
      }
    }
    return formatOrder(order);
  }
}

export const checkoutService = new CheckoutService();
