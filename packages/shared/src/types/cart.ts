import { Paise } from '../utils/money.js';

export interface DeliveryAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface CartItem {
  productId: string;
  tenureMonths: number;
  quantity: number;
  monthlyRentPaise: Paise;
  securityDepositPaise: Paise;
  unit: 'month';
  title?: string;
  imageUrl?: string;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  deliveryAddress?: DeliveryAddress;
  preferredDeliveryDate?: string;
  preferredDeliverySlot?: 'morning' | 'afternoon' | 'evening';
  updatedAt: string;
}
