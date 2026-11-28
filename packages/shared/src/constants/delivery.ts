/**
 * Delivery scheduling constants shared across the API and web clients.
 *
 * Delivery is modelled as a `date` + `slot` (time window) pair. Each vendor
 * publishes a lead time (in hours) that must elapse before a slot is bookable,
 * and the platform enforces a per-slot daily capacity plus optional blackout
 * dates. Keeping these constants in one place keeps the server calculation and
 * the client display in lockstep.
 */

export const DELIVERY_SLOTS = {
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
} as const;

export type DeliverySlot = (typeof DELIVERY_SLOTS)[keyof typeof DELIVERY_SLOTS];

export const DELIVERY_SLOT_VALUES: readonly DeliverySlot[] = [
  DELIVERY_SLOTS.MORNING,
  DELIVERY_SLOTS.AFTERNOON,
  DELIVERY_SLOTS.EVENING,
];

export interface DeliverySlotWindow {
  label: string;
  /** 24-hour local start hour (inclusive). */
  startHour: number;
  /** 24-hour local end hour (exclusive). */
  endHour: number;
}

export const DELIVERY_SLOT_WINDOWS: Record<DeliverySlot, DeliverySlotWindow> = {
  [DELIVERY_SLOTS.MORNING]: { label: 'Morning (9 AM – 1 PM)', startHour: 9, endHour: 13 },
  [DELIVERY_SLOTS.AFTERNOON]: { label: 'Afternoon (1 PM – 5 PM)', startHour: 13, endHour: 17 },
  [DELIVERY_SLOTS.EVENING]: { label: 'Evening (5 PM – 9 PM)', startHour: 17, endHour: 21 },
};

/** Default number of orders a single date + slot can accept, platform-wide. */
export const DEFAULT_SLOT_CAPACITY = 6;

/** How far into the future a renter may pick a delivery date. */
export const MAX_DELIVERY_HORIZON_DAYS = 30;

/** Fallback vendor lead time (hours) when no cart item specifies one. */
export const DEFAULT_DELIVERY_LEAD_TIME_HOURS = 48;
