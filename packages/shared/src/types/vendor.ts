import { VendorStatus } from '../constants/categories.js';

export interface ICity {
  id: string;
  name: string;
  state: string;
  pincodes: string[];
  isActive: boolean;
}

export interface IVendorProfile {
  id: string;
  userId: string;
  businessName: string;
  contactPhone: string;
  cityId: string;
  cityName?: string;
  servicePincodes: string[];
  verificationStatus: VendorStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IVendorLedgerEntry {
  id: string;
  vendorId: string;
  orderId: string;
  grossRentPaise: number;
  commissionPercent: number;
  commissionPaise: number;
  netPayablePaise: number;
  status: 'PENDING' | 'PAID';
  payoutReference?: string;
  paidAt?: string;
  paidBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAuditEvent {
  id: string;
  actorId: string;
  actorRole: 'admin';
  action: string;
  entityType: 'vendor' | 'kyc' | 'order' | 'city' | 'settings';
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IPlatformSettings {
  id: string;
  platformCommissionPercent: number;
  kycWindowHours: number;
  reservationTtlMinutes: number;
  updatedAt: string;
}
