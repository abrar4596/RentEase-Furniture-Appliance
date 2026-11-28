/**
 * Saved delivery address (address book entry) for a renter.
 */
export interface IAddress {
  id: string;
  /** Optional human label such as "Home" or "Office". */
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
