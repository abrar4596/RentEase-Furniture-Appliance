/**
 * Minimal, dependency-free wrapper around the hosted Razorpay Checkout script
 * (`https://checkout.razorpay.com/v1/checkout.js`) that the root layout loads via
 * `next/script`. Keeping the official npm package out of the bundle means the
 * checkout page stays lean; the server remains the only party that creates
 * orders and verifies signatures.
 */

export interface RazorpayCheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutParams {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
}

interface RazorpayConstructorOptions extends RazorpayCheckoutParams {
  handler: (response: RazorpayCheckoutSuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (options: RazorpayConstructorOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/** Raised when the renter closes the Razorpay modal without paying. */
export class PaymentDismissedError extends Error {
  constructor() {
    super('Payment was cancelled');
    this.name = 'PaymentDismissedError';
  }
}

export const RAZORPAY_SCRIPT_ID = 'razorpay-checkout-script';
const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = RAZORPAY_SCRIPT_ID;
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment library'));
    document.body.appendChild(script);
  });
}

/**
 * Resolves once `window.Razorpay` is available. Waits briefly for the layout's
 * `next/script` tag, then falls back to injecting the script so a slow or failed
 * script load never strands the renter at the payment step.
 */
export async function loadRazorpay(timeoutMs = 8000): Promise<void> {
  if (typeof window === 'undefined') throw new Error('Payment is only available in the browser');
  if (window.Razorpay) return;

  const deadline = Date.now() + timeoutMs;
  while (!window.Razorpay && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (window.Razorpay) return;

  if (!document.getElementById(RAZORPAY_SCRIPT_ID)) {
    try {
      await injectScript();
    } catch {
      // Fall through to the explicit error below.
    }
  }
  if (!window.Razorpay) throw new Error('Payment library could not be loaded. Please retry.');
}

/**
 * Opens the Razorpay modal for a server-created order. Resolves with the
 * signature payload on a successful capture, or rejects with
 * {@link PaymentDismissedError} when the renter closes the modal without paying.
 * Callers must still verify the payload server-side before treating it as paid.
 */
export function openRazorpayCheckout(
  params: RazorpayCheckoutParams
): Promise<RazorpayCheckoutSuccess> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.Razorpay) {
      reject(new Error('Payment is not ready yet. Please retry.'));
      return;
    }
    const checkout = new window.Razorpay({
      ...params,
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(new PaymentDismissedError()) },
    });
    checkout.open();
  });
}
