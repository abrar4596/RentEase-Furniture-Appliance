import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Payment gateway boundary.
 *
 * All Razorpay interaction goes through this interface so that services depend
 * on an abstraction (and tests/offline development get a deterministic
 * implementation) rather than the provider's HTTP API. Signature verification is
 * always real HMAC — only the outbound order/refund calls can be stubbed when no
 * live credentials are configured.
 */
export interface PaymentGateway {
  /** Publishable key id handed to the browser to open Razorpay Checkout. */
  readonly keyId: string;
  /** False when the platform is running without real Razorpay credentials. */
  readonly isConfigured: boolean;
  /** Creates a gateway order for `amountPaise` and returns its id. */
  createOrder(amountPaise: number, receipt: string): Promise<string>;
  /** Constant-time verification of a Razorpay Checkout success signature. */
  verifyPaymentSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): boolean;
  /** Verifies the `x-razorpay-signature` header against the raw request body. */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
  /** Issues a (full or partial) refund for a captured payment. */
  createRefund(input: {
    paymentId: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amountPaise: number; status: string }>;
}

function timingSafeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function hasRealCredentials(): boolean {
  return (
    env.RAZORPAY_KEY_ID.startsWith('rzp_') &&
    !env.RAZORPAY_KEY_ID.includes('placeholder') &&
    !env.RAZORPAY_KEY_SECRET.includes('placeholder')
  );
}

class RazorpayGateway implements PaymentGateway {
  public readonly keyId = env.RAZORPAY_KEY_ID;
  public readonly isConfigured = hasRealCredentials();

  private authHeader(): string {
    return `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
  }

  public async createOrder(amountPaise: number, receipt: string): Promise<string> {
    if (!this.isConfigured) return `rzp_test_order_${crypto.randomBytes(8).toString('hex')}`;

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
    });
    if (!response.ok) throw new Error('Razorpay order creation failed');
    const data = (await response.json()) as { id: string };
    return data.id;
  }

  public verifyPaymentSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): boolean {
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');
    return timingSafeEqual(input.signature, expected);
  }

  public verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    return timingSafeEqual(signature, expected);
  }

  public async createRefund(input: {
    paymentId: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amountPaise: number; status: string }> {
    if (!this.isConfigured) {
      logger.warn(
        { paymentId: input.paymentId, amountPaise: input.amountPaise },
        'Razorpay credentials not configured; issuing a simulated refund'
      );
      return {
        id: `rfnd_test_${crypto.randomBytes(8).toString('hex')}`,
        amountPaise: input.amountPaise,
        status: 'processed',
      };
    }

    const response = await fetch(`https://api.razorpay.com/v1/payments/${input.paymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountPaise,
        notes: input.notes,
        speed: 'normal',
      }),
    });
    if (!response.ok) throw new Error('Razorpay refund creation failed');
    const data = (await response.json()) as { id: string; amount: number; status: string };
    return { id: data.id, amountPaise: data.amount, status: data.status };
  }
}

export const paymentGateway: PaymentGateway = new RazorpayGateway();
