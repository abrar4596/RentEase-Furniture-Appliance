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
