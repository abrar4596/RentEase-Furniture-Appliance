import { DeliverySlot } from '../constants/delivery.js';
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

/**
 * A priced cart line. Prices are always recomputed from the live product on the
 * server (never trusted from the client), so the client can compare its display
 * against these authoritative values.
 */
export interface CartItem {
  productId: string;
  vendorId: string;
  vendorBusinessName?: string;
  tenureMonths: number;
  quantity: number;
  /** Per-unit monthly rent for the selected tenure. */
  monthlyRentPaise: Paise;
  /** Per-unit security deposit. */
  securityDepositPaise: Paise;
  unit: 'month';
  title?: string;
  imageUrl?: string;
  /** monthlyRentPaise × quantity. */
  lineRentPaise: Paise;
  /** securityDepositPaise × quantity. */
  lineDepositPaise: Paise;
  /** First-month rent + deposit for this line. */
  lineTotalPaise: Paise;
}

/**
 * Cart items grouped by vendor. Phase 4 keeps a single Order per checkout but
 * exposes this vendor-grouped view so each vendor's portion behaves like a
 * sub-order (one sub-order per vendor).
 */
export interface CartVendorGroup {
  vendorId: string;
  vendorBusinessName?: string;
  items: CartItem[];
  subtotalRentPaise: Paise;
  securityDepositPaise: Paise;
  totalUpfrontPaise: Paise;
}

export interface CartTotals {
  itemCount: number;
  unitCount: number;
  subtotalRentPaise: Paise;
  securityDepositPaise: Paise;
  /** First-month rent + security deposit across the whole cart. */
  totalUpfrontPaise: Paise;
}

export interface Cart {
  id: string;
  /** Present for authenticated renter carts. */
  userId?: string;
  /** Present for anonymous (device-cookie) guest carts. */
  guestId?: string;
  items: CartItem[];
  vendorGroups: CartVendorGroup[];
  totals: CartTotals;
  deliveryAddress?: DeliveryAddress;
  preferredDeliveryDate?: string;
  preferredDeliverySlot?: DeliverySlot;
  updatedAt: string;
}
