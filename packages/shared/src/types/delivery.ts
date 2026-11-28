import { DeliverySlot } from '../constants/delivery.js';

/** A single bookable (or blocked) delivery slot for a given date. */
export interface DeliverySlotOption {
  slot: DeliverySlot;
  label: string;
  startHour: number;
  endHour: number;
  available: boolean;
  /** Remaining bookings before the slot reaches capacity (0 when blocked). */
  remaining: number;
  /** Present when `available` is false, explaining why. */
  reason?: string;
}

/** Server-computed delivery slot availability for a pincode + date. */
export interface DeliverySlotsView {
  pincode: string;
  date: string;
  serviceable: boolean;
  blackout: boolean;
  capacity: number;
  leadTimeHours: number;
  /** Earliest date (YYYY-MM-DD) a delivery can realistically be scheduled. */
  earliestEligibleDate: string;
  slots: DeliverySlotOption[];
}
