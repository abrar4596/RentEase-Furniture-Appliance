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
import { InventoryLock, IInventoryLockDocument } from '../models/inventory-lock.model.js';
import {
  ConflictError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '../middleware/error-handler.js';
import { VendorLedger } from '../models/vendor-ledger.model.js';
import { PlatformSettings } from '../models/platform-settings.model.js';
import { AuditEvent } from '../models/audit.model.js';
import { User } from '../models/user.model.js';
import { deliverySlotService } from './delivery-slot.service.js';
import { paymentGateway } from '../adapters/payment-gateway.adapter.js';
import { paymentService } from './payment.service.js';
import { emailService } from './email.service.js';

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

    // Validate serviceability, lead time, capacity and blackout dates in one place
    // so the server never accepts a slot the delivery picker would reject.
    await deliverySlotService.assertSlotBookable(
      cart,
      input.deliveryAddress.pincode,
      input.preferredDeliveryDate,
      input.preferredDeliverySlot
    );

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
      const razorpayOrderId = await paymentGateway.createOrder(
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
      return { order: formatOrder(provisional), keyId: paymentGateway.keyId };
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

    const isValidSignature = paymentGateway.verifyPaymentSignature({
      razorpayOrderId: input.razorpay_order_id,
      razorpayPaymentId: input.razorpay_payment_id,
      signature: input.razorpay_signature,
    });
    if (!isValidSignature) {
      throw new ValidationError('Invalid Razorpay payment signature');
    }

    // Settlement (state change + firm allocation + ledger + confirmation email)
    // is shared with the webhook path and is exactly-once.
    const { order: settled } = await paymentService.settleCapturedOrder(order, {
      razorpayPaymentId: input.razorpay_payment_id,
      razorpaySignature: input.razorpay_signature,
    });
    return formatOrder(settled);
  }

  /**
   * Re-opens payment for an order that is still awaiting payment (e.g. the renter
   * dismissed the Razorpay modal). Reuses the existing gateway order so stock is
   * never double-locked, and refuses once the reservation has lapsed so a renter
   * can never pay for stock the sweeper may already have reclaimed.
   */
  public async resumePayment(
    userId: string,
    orderId: string
  ): Promise<{ order: IOrder; keyId: string }> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot pay for this order');
    if (order.status !== ORDER_STATES.PENDING_PAYMENT)
      throw new ValidationError('This order is not awaiting payment');

    const hasLiveReservation = await InventoryLock.exists({
      orderId: order._id,
      released: false,
      expiresAt: { $gt: new Date() },
    });
    if (!hasLiveReservation) {
      throw new ConflictError('Your payment window has expired. Please start a new checkout.');
    }

    if (!order.razorpayOrderId) {
      order.razorpayOrderId = await paymentGateway.createOrder(
        order.totalUpfrontPaise,
        `rentease_${order._id}`
      );
      await order.save();
    }
    return { order: formatOrder(order), keyId: paymentGateway.keyId };
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

  public async getVendorOrder(userId: string, orderId: string): Promise<IOrder> {
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!profile) throw new NotFoundError('Vendor profile not found');
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.items.some((item) => item.vendorId.toString() === profile._id.toString())) {
      throw new ForbiddenError('You cannot view this order');
    }
    return formatOrder(order);
  }

  public async updateVendorOrderStatus(
    userId: string,
    orderId: string,
    nextStatus: typeof ORDER_STATES.OUT_FOR_DELIVERY | typeof ORDER_STATES.ACTIVE,
    deliveryPhoto?: { publicId: string; url: string }
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
      // Store the optional proof-of-delivery photo.
      if (deliveryPhoto) {
        order.deliveryPhoto = deliveryPhoto;
      }
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

    await this.releaseOrderLocks(order._id.toString());
    return formatOrder(order);
  }

  /** Returns the stock of an order's open reservations and finalises the rows. */
  public async releaseOrderLocks(orderId: string): Promise<void> {
    const order = await Order.findById(orderId);
    if (!order) return;
    const locks = await InventoryLock.find({ orderId: order._id, released: false });
    for (const lock of locks) await this.releaseLock(lock);
  }

  /**
   * Background reconciliation: returns stock for reservations that lapsed without
   * payment. Committed allocations are deliberately skipped — their stock is only
   * returned on cancel/refund. Idempotent: `released` guards double-returning.
   */
  public async reconcileExpiredLocks(): Promise<number> {
    const expiredLocks = await InventoryLock.find({
      released: false,
      committed: false,
      expiresAt: { $lt: new Date() },
    });
    let reconciled = 0;
    for (const lock of expiredLocks) {
      const order = await Order.findById(lock.orderId);
      if (!order || order.status !== ORDER_STATES.PENDING_PAYMENT) continue;
      await this.releaseLock(lock);
      reconciled += lock.quantity;
    }
    return reconciled;
  }

  /** Returns a lock's stock to the product and marks it finalised for TTL cleanup. */
  private async releaseLock(lock: IInventoryLockDocument): Promise<void> {
    await Product.findByIdAndUpdate(lock.productId, { $inc: { stockCount: lock.quantity } });
    const now = new Date();
    lock.released = true;
    lock.releasedAt = now;
    lock.purgeAt = now;
    await lock.save();
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

    const isResubmission = order.status === ORDER_STATES.KYC_REJECTED;

    order.kyc = {
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      frontDocument: input.frontDocument,
      backDocument: input.backDocument,
      submittedAt: new Date(),
    };
    if (isResubmission) {
      assertValidOrderTransition(order.status, ORDER_STATES.PENDING_KYC);
      order.status = ORDER_STATES.PENDING_KYC;
    }
    await order.save();

    // Audit: record every KYC submission (initial or resubmission).
    await AuditEvent.create({
      actorId: new mongoose.Types.ObjectId(userId),
      action: isResubmission ? 'KYC_RESUBMITTED' : 'KYC_SUBMITTED',
      entityType: 'kyc',
      entityId: orderId,
      metadata: { documentType: input.documentType },
    });

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
      const platformCommissionPercent =
        platformSettings?.platformCommissionPercent ?? env.PLATFORM_COMMISSION_PERCENT;

      const byVendor = new Map<string, number>();
      for (const item of order.items) {
        const key = item.vendorId.toString();
        byVendor.set(key, (byVendor.get(key) || 0) + item.monthlyRentPaise * item.quantity);
      }
      for (const [vendorId, grossRentPaise] of byVendor) {
        // Use per-vendor commission if set, otherwise fall back to platform default.
        const vendorProfile = await VendorProfile.findById(vendorId);
        const commissionPercent =
          typeof vendorProfile?.commissionPercent === 'number'
            ? vendorProfile.commissionPercent
            : platformCommissionPercent;
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

    // Audit log every KYC review decision (mandated by Phase 6 — every view/decision).
    await AuditEvent.create({
      actorId: new mongoose.Types.ObjectId(adminUserId),
      action: input.decision === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED',
      entityType: 'kyc',
      entityId: orderId,
      reason: input.rejectionReason,
      metadata: { decision: input.decision },
    });

    // Fire-and-forget email notifications (non-critical — do not throw on failure).
    const renter = await User.findById(order.renterId).catch(() => null);
    if (renter?.email) {
      if (input.decision === 'APPROVED') {
        emailService
          .sendKycApprovedEmail(renter.email, { id: orderId })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            void message; // logged below
          });
      } else {
        emailService
          .sendKycRejectedEmail(renter.email, {
            id: orderId,
            rejectionReason: input.rejectionReason ?? 'Documents could not be verified',
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            void message;
          });
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
