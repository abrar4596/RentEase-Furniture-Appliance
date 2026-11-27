/**
 * KYC Timeout Job
 *
 * Two responsibilities, both driven by `kycWindowHours` from PlatformSettings:
 *
 * 1. REMINDER (at 50 % of the window): If a PENDING_KYC order has no kyc
 *    subdocument after half the window, send a reminder email to the renter.
 *
 * 2. AUTO-CANCEL (at 100 % of the window): If a PENDING_KYC order still has
 *    no submitted kyc after the full window has elapsed, cancel and refund it.
 *
 * The job is intentionally idempotent:
 * - It only acts on PENDING_KYC orders.
 * - It records an `AuditEvent` on every cancellation, so replayed runs skip
 *   already-cancelled orders (they will no longer be PENDING_KYC).
 * - Reminder emails are fire-and-forget and do not change order state.
 *
 * Run from server startup on a cron schedule (every 15 minutes is fine).
 */
import mongoose from 'mongoose';
import { ORDER_STATES, assertValidOrderTransition } from '@rentease/shared';
import { Order } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import { PlatformSettings } from '../models/platform-settings.model.js';
import { AuditEvent } from '../models/audit.model.js';
import { emailService } from '../services/email.service.js';
import { refundService } from '../services/refund.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function runKycTimeoutJob(): Promise<void> {
  try {
    const settings = await PlatformSettings.findOne();
    const kycWindowHours = settings?.kycWindowHours ?? env.KYC_WINDOW_HOURS;
    const now = Date.now();

    const windowMs = kycWindowHours * 60 * 60 * 1000;
    const halfWindowMs = windowMs / 2;

    // Orders stuck in PENDING_KYC that never had KYC submitted.
    // We look for orders whose status has been PENDING_KYC since `createdAt`
    // (or the payment capture time, approximated by `updatedAt`) beyond the
    // half-window threshold. `updatedAt` is updated by Mongoose on every save,
    // so it reflects when the order last changed state — i.e., when payment was
    // captured and status became PENDING_KYC.
    const halfWindowCutoff = new Date(now - halfWindowMs);
    const fullWindowCutoff = new Date(now - windowMs);

    // --- Step 1: Auto-cancel orders past the full window ---
    const expiredOrders = await Order.find({
      status: ORDER_STATES.PENDING_KYC,
      'kyc.submittedAt': { $exists: false }, // No KYC submitted yet
      updatedAt: { $lte: fullWindowCutoff },
    });

    for (const order of expiredOrders) {
      try {
        assertValidOrderTransition(ORDER_STATES.PENDING_KYC, ORDER_STATES.CANCELLED);
        order.status = ORDER_STATES.CANCELLED;
        await order.save();

        await AuditEvent.create({
          actorId: new mongoose.Types.ObjectId(order.renterId),
          action: 'KYC_TIMEOUT_CANCELLED',
          entityType: 'kyc',
          entityId: order._id.toString(),
          reason: `KYC not submitted within ${kycWindowHours} hours; order auto-cancelled`,
        });

        // Issue a full refund (fire-and-forget; failures logged but do not
        // block other cancellations in the batch).
        if (order.razorpayPaymentId) {
          refundService
            .createRefund(order.renterId.toString(), order._id.toString(), {
              reason: `Auto-cancelled: KYC not submitted within ${kycWindowHours} hours`,
            })
            .catch((err: unknown) => {
              logger.error(
                { orderId: order._id.toString(), err },
                'kyc-timeout-job: auto-refund failed'
              );
            });
        }

        // Email notification (fire-and-forget).
        const renter = await User.findById(order.renterId).catch(() => null);
        if (renter?.email) {
          emailService
            .sendKycTimeoutEmail(renter.email, { id: order._id.toString() })
            .catch((err: unknown) => {
              logger.error(
                { orderId: order._id.toString(), err },
                'kyc-timeout-job: timeout email failed'
              );
            });
        }

        logger.info(
          { orderId: order._id.toString() },
          'kyc-timeout-job: order auto-cancelled due to KYC timeout'
        );
      } catch (err) {
        logger.error(
          { orderId: order._id.toString(), err },
          'kyc-timeout-job: failed to cancel order'
        );
      }
    }

    // --- Step 2: Send reminders to orders past the half-window ---
    // Exclude orders that are already past the full window (handled above).
    const reminderOrders = await Order.find({
      status: ORDER_STATES.PENDING_KYC,
      'kyc.submittedAt': { $exists: false },
      updatedAt: { $lte: halfWindowCutoff, $gt: fullWindowCutoff },
    });

    for (const order of reminderOrders) {
      try {
        const renter = await User.findById(order.renterId).catch(() => null);
        if (renter?.email) {
          emailService
            .sendKycReminderEmail(renter.email, {
              id: order._id.toString(),
              kycWindowHours,
            })
            .catch((err: unknown) => {
              logger.error(
                { orderId: order._id.toString(), err },
                'kyc-timeout-job: reminder email failed'
              );
            });
        }
        logger.info(
          { orderId: order._id.toString() },
          'kyc-timeout-job: KYC reminder sent'
        );
      } catch (err) {
        logger.error(
          { orderId: order._id.toString(), err },
          'kyc-timeout-job: failed to send reminder'
        );
      }
    }

    logger.info(
      {
        cancelled: expiredOrders.length,
        reminded: reminderOrders.length,
        kycWindowHours,
      },
      'kyc-timeout-job: run complete'
    );
  } catch (err) {
    logger.error({ err }, 'kyc-timeout-job: unexpected error');
  }
}
