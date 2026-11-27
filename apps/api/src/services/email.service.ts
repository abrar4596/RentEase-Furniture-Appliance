import { logger } from '../utils/logger.js';

export interface IEmailService {
  sendPasswordResetEmail(to: string, resetToken: string): Promise<void>;
  sendWelcomeEmail(to: string, name: string): Promise<void>;
  /** Confirms a paid order once its upfront payment has been captured. */
  sendOrderConfirmationEmail(
    to: string,
    order: { id: string; totalUpfrontPaise: number; itemCount: number }
  ): Promise<void>;
  /** Sent when an admin approves KYC → order moves to CONFIRMED. */
  sendKycApprovedEmail(to: string, order: { id: string }): Promise<void>;
  /** Sent when an admin rejects KYC so the renter knows to resubmit. */
  sendKycRejectedEmail(to: string, order: { id: string; rejectionReason: string }): Promise<void>;
  /** Reminder sent `kycWindowHours / 2` after payment if KYC not yet submitted. */
  sendKycReminderEmail(to: string, order: { id: string; kycWindowHours: number }): Promise<void>;
  /** Sent when the KYC window expires and the order is auto-cancelled. */
  sendKycTimeoutEmail(to: string, order: { id: string }): Promise<void>;
}

export class MockEmailService implements IEmailService {
  private sentEmails: Array<{ to: string; subject: string; body: string }> = [];

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const subject = 'RentEase - Password Reset Request';
    const body = `You requested a password reset. Use reset token: ${resetToken}`;
    this.sentEmails.push({ to, subject, body });

    logger.info(
      { to, resetToken: '***REDACTED***' },
      'MockEmailService: Password reset email dispatched'
    );
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const subject = 'Welcome to RentEase!';
    const body = `Hi ${name}, welcome to RentEase - Hyperlocal Furniture & Appliance Rentals.`;
    this.sentEmails.push({ to, subject, body });

    logger.info({ to, name }, 'MockEmailService: Welcome email dispatched');
  }

  async sendOrderConfirmationEmail(
    to: string,
    order: { id: string; totalUpfrontPaise: number; itemCount: number }
  ): Promise<void> {
    const subject = `RentEase - Order ${order.id.slice(-8)} confirmed`;
    const body = `We have received your upfront payment of ₹${(
      order.totalUpfrontPaise / 100
    ).toFixed(2)} for ${order.itemCount} item(s). Complete your KYC to schedule delivery.`;
    this.sentEmails.push({ to, subject, body });

    logger.info({ to, orderId: order.id }, 'MockEmailService: Order confirmation email dispatched');
  }

  async sendKycApprovedEmail(to: string, order: { id: string }): Promise<void> {
    const subject = `RentEase - Your KYC is approved! Order ${order.id.slice(-8)} confirmed`;
    const body = `Great news! Your KYC documents have been verified and your order #${order.id.slice(-8)} is now confirmed. Your vendor will schedule delivery shortly.`;
    this.sentEmails.push({ to, subject, body });
    logger.info({ to, orderId: order.id }, 'MockEmailService: KYC approved email dispatched');
  }

  async sendKycRejectedEmail(
    to: string,
    order: { id: string; rejectionReason: string }
  ): Promise<void> {
    const subject = `RentEase - KYC rejected for order ${order.id.slice(-8)} — please resubmit`;
    const body = `Your KYC documents for order #${order.id.slice(-8)} were rejected. Reason: ${order.rejectionReason}. Please resubmit valid documents to continue your rental.`;
    this.sentEmails.push({ to, subject, body });
    logger.info({ to, orderId: order.id }, 'MockEmailService: KYC rejected email dispatched');
  }

  async sendKycReminderEmail(
    to: string,
    order: { id: string; kycWindowHours: number }
  ): Promise<void> {
    const subject = `RentEase - Action required: complete KYC for order ${order.id.slice(-8)}`;
    const body = `You have ${Math.floor(order.kycWindowHours / 2)} hours left to submit your KYC documents for order #${order.id.slice(-8)}. If not submitted in time, your order will be automatically cancelled and refunded.`;
    this.sentEmails.push({ to, subject, body });
    logger.info({ to, orderId: order.id }, 'MockEmailService: KYC reminder email dispatched');
  }

  async sendKycTimeoutEmail(to: string, order: { id: string }): Promise<void> {
    const subject = `RentEase - Order ${order.id.slice(-8)} cancelled — KYC not submitted`;
    const body = `Your order #${order.id.slice(-8)} has been automatically cancelled as KYC documents were not submitted within the required time. A full refund has been initiated.`;
    this.sentEmails.push({ to, subject, body });
    logger.info({ to, orderId: order.id }, 'MockEmailService: KYC timeout email dispatched');
  }

  getSentEmails(): ReadonlyArray<{ to: string; subject: string; body: string }> {
    return [...this.sentEmails];
  }

  getLastEmail(): { to: string; subject: string; body: string } | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clear(): void {
    this.sentEmails = [];
  }
}

export const emailService: IEmailService = new MockEmailService();
