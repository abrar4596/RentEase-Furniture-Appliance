import { OrderState } from '../constants/order-states.js';
import { Paise } from '../utils/money.js';
import { DeliveryAddress } from './cart.js';

export interface OrderItem {
  productId: string;
  title: string;
  vendorId: string;
  tenureMonths: number;
  quantity: number;
  monthlyRentPaise: Paise;
  securityDepositPaise: Paise;
  lineTotalPaise: Paise;
}

export interface KycDocument {
  publicId: string;
  url: string;
}

export interface OrderKyc {
  documentType: 'AADHAR' | 'PAN' | 'DL' | 'PASSPORT' | 'VOTER_ID';
  documentNumber: string;
  frontDocument: KycDocument;
  backDocument?: KycDocument;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface MaintenancePhoto {
  publicId: string;
  url: string;
}

export interface MaintenanceRequest {
  id: string;
  description: string;
  photos: MaintenancePhoto[];
  category: 'GENERAL' | 'ELECTRICAL' | 'PLUMBING' | 'FURNITURE' | 'APPLIANCE';
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED';
  assignedVendorId?: string;
  assignedAt?: string;
  inProgressAt?: string;
  createdAt: string;
  resolvedAt?: string;
  renterConfirmedAt?: string;
}

export interface RentalReturn {
  requestedAt: string;
  preferredPickupDate: string;
  reason?: string;
  returnedAt?: string;
  depositRefundPaise?: Paise;
  depositRefundStatus?: 'PENDING' | 'PROCESSED';
}

export interface DamageClaim {
  description: string;
  photos: MaintenancePhoto[];
  deductedPaise: Paise;
  createdAt: string;
  disputed?: boolean;
  arbitrationReason?: string;
  arbitratedAt?: string;
  arbitratedBy?: string;
}

export interface IOrder {
  id: string;
  renterId: string;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  preferredDeliveryDate: string;
  preferredDeliverySlot: 'morning' | 'afternoon' | 'evening';
  subtotalRentPaise: Paise;
  securityDepositPaise: Paise;
  totalUpfrontPaise: Paise;
  status: OrderState;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  kyc?: OrderKyc;
  kycApprovedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  rentalStartAt?: string;
  rentalEndAt?: string;
  nextDueAt?: string;
  overdueAt?: string;
  maintenanceRequests: MaintenanceRequest[];
  returnRequest?: RentalReturn;
  damageClaim?: DamageClaim;
  createdAt: string;
  updatedAt: string;
}
