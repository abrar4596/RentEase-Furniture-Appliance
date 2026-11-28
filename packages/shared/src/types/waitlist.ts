export type WaitlistStatus = 'PENDING' | 'NOTIFIED';

export interface IWaitlistEntry {
  id: string;
  cityName: string;
  pincode?: string;
  name?: string;
  email?: string;
  phone?: string;
  status: WaitlistStatus;
  createdAt: string;
}
