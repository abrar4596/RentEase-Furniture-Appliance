import { logger } from '../utils/logger.js';

export interface IEmailService {
  sendPasswordResetEmail(to: string, resetToken: string): Promise<void>;
  sendWelcomeEmail(to: string, name: string): Promise<void>;
  /** Confirms a paid order once its upfront payment has been captured. */
  sendOrderConfirmationEmail(
    to: string,
    order: { id: string; totalUpfrontPaise: number; itemCount: number }
  ): Promise<void>;
  sendMaintenanceUpdateEmail(to: string, subject: string, body: string): Promise<void>;
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

  async sendMaintenanceUpdateEmail(to: string, subject: string, body: string): Promise<void> {
    this.sentEmails.push({ to, subject, body });
    logger.info({ to, subject }, 'MockEmailService: Lifecycle email dispatched');
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
