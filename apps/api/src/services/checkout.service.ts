import mongoose from 'mongoose';
import {
  DeliveryAddress,
  IOrder,
  ORDER_STATES,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
  assertValidOrderTransition,
  calculateUpfrontDue,
  calculateDepositSettlement,
  RENTAL_INVOICE_STATUSES,
} from '@rentease/shared';
import { env } from '../config/env.js';
import { Cart } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { Order, formatOrder, formatOrderForVendor } from '../models/order.model.js';
import { InventoryLock, IInventoryLockDocument } from '../models/inventory-lock.model.js';
import {
  ConflictError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '../middleware/error-handler.js';
import { calculateCommissionPaise } from '@rentease/shared';
import { VendorLedger } from '../models/vendor-ledger.model.js';
import { PlatformSettings } from '../models/platform-settings.model.js';
import { deliverySlotService } from './delivery-slot.service.js';
import { paymentGateway } from '../adapters/payment-gateway.adapter.js';
import { paymentService } from './payment.service.js';
import { paymentLedgerService } from './payment-ledger.service.js';
import { RentalInvoice, formatRentalInvoice } from '../models/rental-invoice.model.js';
import { User } from '../models/user.model.js';
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
    return orders.map(formatOrderForVendor);
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
      order.deliveredAt = start;
      order.rentalStartAt = start;
      const end = new Date(start);
      const tenureMonths = order.items.length
        ? Math.max(...order.items.map((item) => item.tenureMonths))
        : 1;
      end.setMonth(end.getMonth() + tenureMonths);
      order.rentalEndAt = end;
      const nextDue = new Date(start);
      nextDue.setMonth(nextDue.getMonth() + 1);
      order.nextDueAt = nextDue;
    }
    if (nextStatus === ORDER_STATES.OUT_FOR_DELIVERY) {
      order.outForDeliveryAt = new Date();
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
    if (order.razorpayPaymentId) {
      throw new ValidationError(
        'Captured payments cannot be cancelled directly. Request an admin refund first.'
      );
    }
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
    if (input.decision === 'APPROVED') {
      order.kycApprovedAt = new Date();
    }
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
        const vendor = await VendorProfile.findById(vendorId);
        const effectiveCommissionPercent =
          vendor?.commissionPercent ?? commissionPercent;
        const commissionPaise = calculateCommissionPaise(
          grossRentPaise,
          effectiveCommissionPercent
        );
        await VendorLedger.findOneAndUpdate(
          { vendorId: new mongoose.Types.ObjectId(vendorId), orderId: order._id },
          {
            $setOnInsert: {
              grossRentPaise,
              commissionPercent: effectiveCommissionPercent,
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
    input: {
      description: string;
      category?: 'GENERAL' | 'ELECTRICAL' | 'PLUMBING' | 'FURNITURE' | 'APPLIANCE';
      photos: Array<{ publicId: string; url: string }>;
    }
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
      category: input.category || 'GENERAL',
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

    let extensionAmountPaise = 0;
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (!product) throw new NotFoundError('Rental product not found');
      const newTenureMonths = item.tenureMonths + additionalMonths;
      const exactTier = product.tenureTiers.find(
        (tier) => tier.tenureMonths === newTenureMonths
      );
      const applicableTier =
        exactTier ||
        product.tenureTiers
          .filter((tier) => tier.tenureMonths >= newTenureMonths)
          .sort((a, b) => a.tenureMonths - b.tenureMonths)[0];
      const monthlyRentPaise = applicableTier?.monthlyRentPaise ?? item.monthlyRentPaise;
      extensionAmountPaise += monthlyRentPaise * item.quantity * additionalMonths;
      item.tenureMonths = newTenureMonths;
      item.monthlyRentPaise = monthlyRentPaise;
      item.lineTotalPaise = monthlyRentPaise * item.quantity * additionalMonths;
    }
    const end = new Date(order.rentalEndAt);
    end.setMonth(end.getMonth() + additionalMonths);
    order.rentalEndAt = end;
    order.nextDueAt = order.nextDueAt
      ? new Date(order.nextDueAt)
      : order.rentalStartAt
        ? new Date(order.rentalStartAt)
        : new Date();
    if (extensionAmountPaise > 0) {
      const dueAt = new Date(order.rentalStartAt || new Date());
      dueAt.setMonth(dueAt.getMonth() + Math.max(1, additionalMonths));
      const invoiceCount = await RentalInvoice.countDocuments({ orderId: order._id });
      await RentalInvoice.create({
        orderId: order._id,
        renterId: order.renterId,
        monthIndex: 1_000_000 + invoiceCount + 1,
        dueAt,
        amountPaise: extensionAmountPaise,
        status: RENTAL_INVOICE_STATUSES.PENDING,
      });
    }
    await order.save();
    return formatOrder(order);
  }

  public async generateMonthlyInvoices(
    userId: string,
    orderId: string
  ): Promise<ReturnType<typeof formatRentalInvoice>[]> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot generate invoices for this order');
    if (order.status !== ORDER_STATES.ACTIVE)
      throw new ValidationError('Invoices are available only for active rentals');
    if (!order.rentalStartAt || !order.rentalEndAt)
      throw new ValidationError('Rental dates are missing');

    const invoices = [];
    const currentMonth = new Date(order.rentalStartAt);
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    const monthlyRentPaise = order.items.reduce(
      (sum, item) => sum + item.monthlyRentPaise * item.quantity,
      0
    );
    let monthIndex = 2;
    while (currentMonth <= order.rentalEndAt) {
      const dueAt = new Date(currentMonth);
      const invoice = await RentalInvoice.findOneAndUpdate(
        { orderId: order._id, monthIndex },
        {
          $setOnInsert: {
            orderId: order._id,
            renterId: order.renterId,
            monthIndex,
            dueAt,
            amountPaise: monthlyRentPaise,
            status:
              dueAt < new Date()
                ? RENTAL_INVOICE_STATUSES.OVERDUE
                : RENTAL_INVOICE_STATUSES.PENDING,
          },
        },
        { upsert: true, new: true }
      );
      invoices.push(formatRentalInvoice(invoice));
      if (dueAt < new Date() && !order.overdueAt) order.overdueAt = dueAt;
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      monthIndex += 1;
    }
    await order.save();
    return invoices;
  }

  public generateRentalInvoices(
    userId: string,
    orderId: string
  ): Promise<ReturnType<typeof formatRentalInvoice>[]> {
    return this.generateMonthlyInvoices(userId, orderId);
  }

  public async listRentalInvoices(
    userId: string,
    orderId: string
  ): Promise<ReturnType<typeof formatRentalInvoice>[]> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot view invoices for this order');
    const invoices = await RentalInvoice.find({ orderId: order._id }).sort({ monthIndex: 1 });
    return invoices.map(formatRentalInvoice);
  }

  public async markOverdueInvoices(): Promise<number> {
    const result = await RentalInvoice.updateMany(
      {
        status: RENTAL_INVOICE_STATUSES.PENDING,
        dueAt: { $lt: new Date() },
      },
      { $set: { status: RENTAL_INVOICE_STATUSES.OVERDUE } }
    );
    return result.modifiedCount;
  }

  public async startInvoicePayment(
    userId: string,
    orderId: string,
    invoiceId: string
  ): Promise<{ invoice: ReturnType<typeof formatRentalInvoice>; keyId: string }> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot pay this invoice');
    if (!mongoose.isValidObjectId(invoiceId)) throw new ValidationError('Invalid invoice ID');
    const invoice = await RentalInvoice.findOne({ _id: invoiceId, orderId: order._id });
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (invoice.status === RENTAL_INVOICE_STATUSES.PAID)
      throw new ConflictError('This invoice is already paid');
    if (!invoice.razorpayOrderId) {
      invoice.razorpayOrderId = await paymentGateway.createOrder(
        invoice.amountPaise,
        `rentease_invoice_${invoice._id}`
      );
      await invoice.save();
    }
    return { invoice: formatRentalInvoice(invoice), keyId: paymentGateway.keyId };
  }

  public async verifyInvoicePayment(
    userId: string,
    orderId: string,
    invoiceId: string,
    input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
  ): Promise<ReturnType<typeof formatRentalInvoice>> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot verify this invoice');
    const invoice = await RentalInvoice.findOne({ _id: invoiceId, orderId: order._id });
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (invoice.razorpayOrderId !== input.razorpay_order_id)
      throw new ValidationError('Razorpay order mismatch');
    const valid = paymentGateway.verifyPaymentSignature({
      razorpayOrderId: input.razorpay_order_id,
      razorpayPaymentId: input.razorpay_payment_id,
      signature: input.razorpay_signature,
    });
    if (!valid) throw new ValidationError('Invalid Razorpay payment signature');
    invoice.status = RENTAL_INVOICE_STATUSES.PAID;
    invoice.razorpayPaymentId = input.razorpay_payment_id;
    invoice.paidAt = new Date();
    await invoice.save();
    await paymentLedgerService.recordRentPayment(
      order,
      invoice.amountPaise,
      input.razorpay_payment_id,
      `Rental invoice ${invoice.monthIndex} paid`
    );
    if (order.nextDueAt) {
      const nextDue = new Date(order.nextDueAt);
      nextDue.setMonth(nextDue.getMonth() + 1);
      if (!order.rentalEndAt || nextDue <= order.rentalEndAt) order.nextDueAt = nextDue;
    }
    if (order.overdueAt) {
      const remainingOverdue = await RentalInvoice.exists({
        orderId: order._id,
        status: RENTAL_INVOICE_STATUSES.OVERDUE,
      });
      if (!remainingOverdue) order.overdueAt = undefined;
    }
    await order.save();
    return formatRentalInvoice(invoice);
  }

  public async sendInvoiceReminder(
    userId: string,
    orderId: string
  ): Promise<{ sent: boolean }> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot request reminders for this order');
    const renter = await User.findById(order.renterId);
    if (renter) {
      await emailService.sendMaintenanceUpdateEmail?.(
        renter.email,
        'Rental invoice reminder',
        `Your RentEase invoice for order ${order.id} is due.`
      );
    }
    return { sent: true };
  }

  public async updateMaintenanceStatus(
    actorId: string,
    orderId: string,
    ticketId: string,
    status: 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED'
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    const ticket = order.maintenanceRequests.find((entry) => entry._id.toString() === ticketId);
    if (!ticket) throw new NotFoundError('Maintenance ticket not found');

    const actor = await User.findById(actorId);
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(actorId) });
    const isAdmin = actor?.role === 'admin';
    const ownsVendorTicket =
      profile && order.items.some((item) => item.vendorId.toString() === profile._id.toString());
    if (!isAdmin && !ownsVendorTicket)
      throw new ForbiddenError('You cannot update this maintenance ticket');

    const allowed: Record<typeof ticket.status, readonly typeof status[]> = {
      OPEN: ['ASSIGNED'],
      ASSIGNED: ['IN_PROGRESS'],
      IN_PROGRESS: ['RESOLVED'],
      RESOLVED: [],
    };
    if (!(allowed[ticket.status] as readonly typeof status[]).includes(status)) {
      throw new ValidationError(`Invalid maintenance transition from ${ticket.status} to ${status}`);
    }
    ticket.status = status;
    if (status === 'ASSIGNED') {
      ticket.assignedVendorId = profile?._id;
      ticket.assignedAt = new Date();
    }
    if (status === 'IN_PROGRESS') ticket.inProgressAt = new Date();
    if (status === 'RESOLVED') {
      ticket.resolvedAt = new Date();
      const renter = await User.findById(order.renterId);
      if (renter) {
        await emailService.sendMaintenanceUpdateEmail?.(
          renter.email,
          'Maintenance request resolved',
          `Your maintenance request ${ticketId.slice(-8)} is resolved.`
        );
      }
    }
    await order.save();
    return formatOrder(order);
  }

  public async confirmMaintenance(
    userId: string,
    orderId: string,
    ticketId: string
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot confirm this ticket');
    const ticket = order.maintenanceRequests.find((entry) => entry._id.toString() === ticketId);
    if (!ticket) throw new NotFoundError('Maintenance ticket not found');
    if (ticket.status !== 'RESOLVED')
      throw new ValidationError('Only resolved maintenance tickets can be confirmed');
    ticket.renterConfirmedAt = new Date();
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
    const settlement = calculateDepositSettlement(
      order.securityDepositPaise,
      order.damageClaim?.deductedPaise || 0
    );
    if (order.returnRequest) {
      order.returnRequest.depositRefundPaise = settlement.refundPaise;
      order.returnRequest.depositRefundStatus = 'PENDING';
    }
    await order.save();
    for (const item of order.items) {
      if (item.vendorId.toString() === profile._id.toString()) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { stockCount: item.quantity } });
      }
    }
    return formatOrder(order);
  }

  public async disputeDamageClaim(
    userId: string,
    orderId: string,
    reason: string
  ): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.renterId.toString() !== userId)
      throw new ForbiddenError('You cannot dispute this damage claim');
    if (!order.damageClaim)
      throw new ValidationError('This order has no damage claim');
    if (order.damageClaim.disputed)
      throw new ConflictError('This damage claim is already disputed');
    order.damageClaim.disputed = true;
    order.damageClaim.arbitrationReason = reason;
    await order.save();
    return formatOrder(order);
  }
}

export const checkoutService = new CheckoutService();
