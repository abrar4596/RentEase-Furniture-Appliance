import { Request, Response, NextFunction } from 'express';
import { ORDER_STATES } from '@rentease/shared';
import { checkoutService } from '../services/checkout.service.js';
import { paymentService } from '../services/payment.service.js';
import { refundService } from '../services/refund.service.js';
import { paymentLedgerService } from '../services/payment-ledger.service.js';
import { paymentGateway } from '../adapters/payment-gateway.adapter.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../middleware/error-handler.js';
import { Order } from '../models/order.model.js';
import { adminService } from '../services/admin.service.js';
import { WebhookEvent } from '../models/webhook-event.model.js';
import { logger } from '../utils/logger.js';

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export class CheckoutController {
  private requireUser(req: Request): string {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    return req.user._id.toString();
  }

  public createCheckout = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await checkoutService.createCheckout(this.requireUser(req), req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
  public verifyPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await checkoutService.verifyPayment(this.requireUser(req), {
        ...req.body,
        orderId: req.params.id || req.body.orderId,
      });
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public resumePayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await checkoutService.resumePayment(
        this.requireUser(req),
        req.params.id as string
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
  public getOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: { orders: await checkoutService.getOrders(this.requireUser(req)) },
      });
    } catch (error) {
      next(error);
    }
  };
  public getVendorOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        data: { orders: await checkoutService.getVendorOrders(this.requireUser(req)) },
      });
    } catch (error) {
      next(error);
    }
  };
  public updateVendorOrderStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await checkoutService.updateVendorOrderStatus(
        this.requireUser(req),
        req.params.id as string,
        req.body.status
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          order: await checkoutService.getOrder(this.requireUser(req), req.params.id as string),
        },
      });
    } catch (error) {
      next(error);
    }
  };
  public cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          order: await checkoutService.cancelOrder(this.requireUser(req), req.params.id as string),
        },
      });
    } catch (error) {
      next(error);
    }
  };
  public submitKyc = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await checkoutService.submitKyc(
        this.requireUser(req),
        req.params.id as string,
        req.body
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public adminListPendingKyc = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orders = await checkoutService.adminListPendingKyc();
      res.json({ success: true, data: { orders } });
    } catch (error) {
      next(error);
    }
  };
  public adminReviewKyc = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const order = await checkoutService.adminReviewKyc(
        req.user._id.toString(),
        req.params.id as string,
        req.body
      );
      await adminService.recordAudit(
        req.user._id.toString(),
        'KYC_REVIEWED',
        'kyc',
        req.params.id as string,
        req.body.rejectionReason,
        { decision: req.body.decision }
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public addMaintenanceRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await checkoutService.addMaintenanceRequest(
        this.requireUser(req),
        req.params.id as string,
        req.body
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public extendTenure = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await checkoutService.extendTenure(
        this.requireUser(req),
        req.params.id as string,
        req.body.additionalMonths
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public requestReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await checkoutService.requestReturn(
        this.requireUser(req),
        req.params.id as string,
        req.body
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public completeReturn = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await checkoutService.completeReturn(
        this.requireUser(req),
        req.params.id as string,
        req.body
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public listInvoices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const invoices = await checkoutService.listRentalInvoices(
        this.requireUser(req),
        req.params.id as string
      );
      res.json({ success: true, data: { invoices } });
    } catch (error) {
      next(error);
    }
  };
  public generateInvoices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const invoices = await checkoutService.generateMonthlyInvoices(
        this.requireUser(req),
        req.params.id as string
      );
      res.json({ success: true, data: { invoices } });
    } catch (error) {
      next(error);
    }
  };
  public startInvoicePayment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await checkoutService.startInvoicePayment(
        this.requireUser(req),
        req.params.id as string,
        req.params.invoiceId as string
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
  public verifyInvoicePayment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const invoice = await checkoutService.verifyInvoicePayment(
        this.requireUser(req),
        req.params.id as string,
        req.params.invoiceId as string,
        req.body
      );
      res.json({ success: true, data: { invoice } });
    } catch (error) {
      next(error);
    }
  };
  public updateMaintenanceStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await checkoutService.updateMaintenanceStatus(
        this.requireUser(req),
        req.params.id as string,
        req.params.ticketId as string,
        req.body.status
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public confirmMaintenance = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await checkoutService.confirmMaintenance(
        this.requireUser(req),
        req.params.id as string,
        req.params.ticketId as string
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public disputeDamage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await checkoutService.disputeDamageClaim(
        this.requireUser(req),
        req.params.id as string,
        req.body.reason
      );
      res.json({ success: true, data: { order } });
    } catch (error) {
      next(error);
    }
  };
  public adminRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const refund = await refundService.createRefund(
        req.user._id.toString(),
        req.params.id as string,
        req.body
      );
      await adminService.recordAudit(
        req.user._id.toString(),
        'REFUND_ISSUED',
        'order',
        req.params.id as string,
        req.body.reason,
        { refundId: refund.id, amountPaise: refund.amountPaise, status: refund.status }
      );
      res.status(201).json({ success: true, data: { refund } });
    } catch (error) {
      next(error);
    }
  };
  /** Read-only money trail for an order: immutable ledger entries + refund records. */
  public adminListPayments = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const order = await Order.findById(orderId);
      if (!order) throw new NotFoundError('Order not found');
      const [ledger, refunds] = await Promise.all([
        paymentLedgerService.listForOrder(orderId),
        refundService.listForOrder(orderId),
      ]);
      res.json({ success: true, data: { ledger, refunds } });
    } catch (error) {
      next(error);
    }
  };
  /**
   * Razorpay webhook. Only verified events mutate money state: the raw body is
   * validated against the `x-razorpay-signature` header, replays are ignored via
   * the event-id store, and every handler is idempotent so a retried delivery is
   * harmless. Handler state changes are guarded so a late event (e.g. a capture
   * arriving after cancellation) can never resurrect a closed order.
   */
  public webhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) throw new ValidationError('Missing raw webhook payload');
      if (
        typeof signature !== 'string' ||
        !paymentGateway.verifyWebhookSignature(rawBody, signature)
      ) {
        throw new ValidationError('Invalid Razorpay webhook signature');
      }

      const event = req.body as RazorpayWebhookBody;
      const entityId =
        event.payload?.refund?.entity?.id ||
        event.payload?.payment?.entity?.id ||
        event.payload?.payment?.entity?.order_id;
      const eventId = event.event && entityId ? `${event.event}:${entityId}` : undefined;

      if (event.event && eventId) {
        const alreadyProcessed = await WebhookEvent.findOne({ eventId });
        if (alreadyProcessed) {
          res.json({ success: true, data: { received: true, duplicate: true } });
          return;
        }
      }

      if (event.event === 'payment.captured') await this.handlePaymentCaptured(event);
      if (event.event === 'payment.failed') await this.handlePaymentFailed(event);
      if (event.event === 'refund.processed') await this.handleRefundProcessed(event);

      if (event.event && eventId) {
        try {
          await WebhookEvent.create({ eventId, event: event.event });
        } catch (error) {
          // A concurrent delivery already recorded this event; handlers are idempotent.
          if (!isDuplicateKeyError(error)) throw error;
        }
      }
      res.json({ success: true, data: { received: true } });
    } catch (error) {
      next(error);
    }
  };

  private async handlePaymentCaptured(event: RazorpayWebhookBody): Promise<void> {
    const entity = event.payload?.payment?.entity;
    if (!entity?.order_id) return;
    const order = await Order.findOne({ razorpayOrderId: entity.order_id });
    if (!order) {
      logger.warn({ razorpayOrderId: entity.order_id }, 'Captured payment for an unknown order');
      return;
    }
    // Amount tampering: a captured amount that does not match the order's upfront
    // total is refused outright (the order is left for manual reconciliation).
    if (typeof entity.amount === 'number' && entity.amount !== order.totalUpfrontPaise) {
      logger.error(
        {
          orderId: order._id.toString(),
          expectedPaise: order.totalUpfrontPaise,
          capturedPaise: entity.amount,
        },
        'Captured amount mismatch; refusing to settle the order'
      );
      return;
    }
    if (!entity.id) return;
    await paymentService.settleCapturedOrder(order, { razorpayPaymentId: entity.id });
  }

  private async handlePaymentFailed(event: RazorpayWebhookBody): Promise<void> {
    const entity = event.payload?.payment?.entity;
    if (!entity?.order_id) return;
    // Only an unpaid order can be cancelled by a failure — a late failure for an
    // already-captured order must not release its committed allocation.
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: entity.order_id, status: ORDER_STATES.PENDING_PAYMENT },
      { $set: { status: ORDER_STATES.CANCELLED } },
      { new: true }
    );
    if (!order) return;
    await checkoutService.releaseOrderLocks(order._id.toString());
  }

  private async handleRefundProcessed(event: RazorpayWebhookBody): Promise<void> {
    const refundEntity = event.payload?.refund?.entity;
    const paymentEntity = event.payload?.payment?.entity;

    // Preferred path: reconcile the stored refund record we created ourselves.
    if (refundEntity?.id) {
      const reconciled = await refundService.reconcileProcessedRefund(refundEntity.id);
      if (reconciled) return;
    }

    // Fallback: no local record. Locate the order and, if the event covers the
    // full upfront total, settle it (which returns the committed stock).
    const order = paymentEntity?.order_id
      ? await Order.findOne({ razorpayOrderId: paymentEntity.order_id })
      : paymentEntity?.id
        ? await Order.findOne({ razorpayPaymentId: paymentEntity.id })
        : null;
    if (!order) {
      logger.warn({ refundId: refundEntity?.id }, 'Refund processed for an unknown order');
      return;
    }
    if (
      typeof refundEntity?.amount === 'number' &&
      refundEntity.amount >= order.totalUpfrontPaise
    ) {
      await refundService.settleFullRefund(order);
      return;
    }
    logger.warn(
      { orderId: order._id.toString(), refundId: refundEntity?.id },
      'Refund processed without a matching local record; manual reconciliation required'
    );
  }
}

export const checkoutController = new CheckoutController();
