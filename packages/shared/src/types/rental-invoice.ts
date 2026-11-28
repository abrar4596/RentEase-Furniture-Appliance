import { Paise } from '../utils/money.js';
import { RentalInvoiceStatus } from '../constants/payments.js';

export interface IRentalInvoice {
  id: string;
  orderId: string;
  renterId: string;
  monthIndex: number;
  dueAt: string;
  amountPaise: Paise;
  status: RentalInvoiceStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}
