import mongoose from 'mongoose';
import { IVendorLedgerEntry, MarkVendorPayoutInput } from '@rentease/shared';
import { VendorLedger, formatVendorLedger } from '../models/vendor-ledger.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

export class PayoutService {
  public async listAdminLedger(): Promise<IVendorLedgerEntry[]> {
    const entries = await VendorLedger.find().sort({ createdAt: -1 });
    return entries.map(formatVendorLedger);
  }

  public async getVendorLedger(
    userId: string
  ): Promise<{ entries: IVendorLedgerEntry[]; pendingPaise: number; paidPaise: number }> {
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!profile) throw new NotFoundError('Vendor profile not found');
    const entries = await VendorLedger.find({ vendorId: profile._id }).sort({ createdAt: -1 });
    const formatted = entries.map(formatVendorLedger);
    return {
      entries: formatted,
      pendingPaise: formatted
        .filter((entry) => entry.status === 'PENDING')
        .reduce((sum, entry) => sum + entry.netPayablePaise, 0),
      paidPaise: formatted
        .filter((entry) => entry.status === 'PAID')
        .reduce((sum, entry) => sum + entry.netPayablePaise, 0),
    };
  }

  public async markPaid(
    adminUserId: string,
    input: MarkVendorPayoutInput
  ): Promise<IVendorLedgerEntry[]> {
    const vendorId = new mongoose.Types.ObjectId(input.vendorId);
    const entryIds = input.ledgerEntryIds.map((id: string) => new mongoose.Types.ObjectId(id));
    const entries = await VendorLedger.find({
      _id: { $in: entryIds },
      vendorId,
      status: 'PENDING',
    });
    if (entries.length !== entryIds.length) {
      throw new ValidationError('One or more payout entries are invalid or already paid');
    }
    for (const entry of entries) {
      entry.status = 'PAID';
      entry.payoutReference = input.payoutReference;
      entry.paidAt = new Date();
      entry.paidBy = new mongoose.Types.ObjectId(adminUserId);
    }
    await VendorLedger.bulkSave(entries);
    return entries.map(formatVendorLedger);
  }
}

export const payoutService = new PayoutService();
