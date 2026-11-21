import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ORDER_STATES } from '@rentease/shared';
import { checkoutService } from '../services/checkout.service.js';
import { UnauthorizedError, ValidationError } from '../middleware/error-handler.js';
import { env } from '../config/env.js';
import { Order } from '../models/order.model.js';
import { adminService } from '../services/admin.service.js';
import { WebhookEvent } from '../models/webhook-event.model.js';

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
  public webhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) throw new ValidationError('Missing raw webhook payload');
      const payload = rawBody.toString('utf8');
      const expected = crypto
        .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
      if (typeof signature !== 'string' || signature.length !== expected.length)
        throw new ValidationError('Invalid Razorpay webhook signature');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
        throw new ValidationError('Invalid Razorpay webhook signature');
      const event = req.body as {
        event?: string;
        payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
      };
      const eventId =
        event.payload?.payment?.entity?.id || event.payload?.payment?.entity?.order_id;
      if (event.event && eventId) {
        const alreadyProcessed = await WebhookEvent.findOne({ eventId });
        if (alreadyProcessed) {
          res.json({ success: true, data: { received: true, duplicate: true } });
          return;
        }
      }
      if (event.event === 'payment.captured') {
        const entity = event.payload?.payment?.entity;
        if (entity?.order_id) {
          const order = await Order.findOne({ razorpayOrderId: entity.order_id });
          if (order && order.status === ORDER_STATES.PENDING_PAYMENT) {
            order.status = ORDER_STATES.PENDING_KYC;
            order.razorpayPaymentId = entity.id;
            await order.save();
          }
        }
      }
      if (event.event === 'payment.failed') {
        const entity = event.payload?.payment?.entity;
        if (entity?.order_id) {
          const order = await Order.findOne({ razorpayOrderId: entity.order_id });
          if (order && order.status === ORDER_STATES.PENDING_PAYMENT) {
            order.status = ORDER_STATES.CANCELLED;
            await order.save();
            await checkoutService.releaseOrderLocks(order._id.toString());
          }
        }
      }
      if (event.event === 'refund.processed') {
        const entity = event.payload?.payment?.entity;
        if (entity?.order_id) {
          const order = await Order.findOne({ razorpayOrderId: entity.order_id });
          if (order) {
            order.status = ORDER_STATES.REFUNDED;
            await order.save();
          }
        }
      }
      if (event.event && eventId) {
        await WebhookEvent.create({ eventId, event: event.event });
      }
      res.json({ success: true, data: { received: true } });
    } catch (error) {
      next(error);
    }
  };
}

export const checkoutController = new CheckoutController();
