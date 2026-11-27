import mongoose from 'mongoose';
import {
  CreateVendorProfileInput,
  UpdateVendorProfileInput,
  AdminVerifyVendorInput,
  AdminUpdateVendorCommissionInput,
  IVendorProfile,
  VENDOR_STATUSES,
  VendorStatus,
} from '@rentease/shared';
import {
  VendorProfile,
  IVendorProfileDocument,
  formatVendorProfile,
} from '../models/vendor.model.js';
import { City } from '../models/city.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error-handler.js';

export class VendorService {
  public async getProfileByUserId(userId: string): Promise<IVendorProfileDocument | null> {
    return VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
  }

  public async getFormattedProfileByUserId(userId: string): Promise<IVendorProfile | null> {
    const profile = await this.getProfileByUserId(userId);
    if (!profile) return null;

    const city = await City.findById(profile.cityId);
    return formatVendorProfile(profile, city?.name);
  }

  public async createProfile(
    userId: string,
    input: CreateVendorProfileInput
  ): Promise<IVendorProfile> {
    const existing = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (existing) {
      throw new ConflictError('A vendor profile already exists for this account');
    }

    const city = await City.findById(input.cityId);
    if (!city || !city.isActive) {
      throw new ValidationError('Selected city is invalid or currently inactive');
    }

    // Verify all requested pincodes belong to the selected city
    const invalidPincodes = input.servicePincodes.filter(
      (pin: string) => !city.pincodes.includes(pin)
    );
    if (invalidPincodes.length > 0) {
      throw new ValidationError(
        `The following pincodes do not belong to ${city.name}: ${invalidPincodes.join(', ')}`
      );
    }

    const profile = await VendorProfile.create({
      userId: new mongoose.Types.ObjectId(userId),
      businessName: input.businessName,
      contactPhone: input.contactPhone,
      cityId: city._id,
      servicePincodes: input.servicePincodes,
      verificationStatus: VENDOR_STATUSES.PENDING,
    });

    return formatVendorProfile(profile, city.name);
  }

  public async updateProfile(
    userId: string,
    input: UpdateVendorProfileInput
  ): Promise<IVendorProfile> {
    const profile = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!profile) {
      throw new NotFoundError('Vendor profile not found');
    }

    if (input.cityId) {
      const city = await City.findById(input.cityId);
      if (!city || !city.isActive) {
        throw new ValidationError('Selected city is invalid or currently inactive');
      }
      profile.cityId = city._id;
    }

    if (input.servicePincodes) {
      profile.servicePincodes = input.servicePincodes;
    }

    // Validate the effective pincode set against the effective city. This runs
    // whenever either field changes so that switching city cannot leave the
    // vendor servicing pincodes that the city does not cover.
    if (input.cityId || input.servicePincodes) {
      const city = await City.findById(profile.cityId);
      if (city) {
        const invalidPincodes = profile.servicePincodes.filter(
          (pin: string) => !city.pincodes.includes(pin)
        );
        if (invalidPincodes.length > 0) {
          throw new ValidationError(
            `The following pincodes do not belong to ${city.name}: ${invalidPincodes.join(', ')}`
          );
        }
      }
    }

    if (input.businessName) profile.businessName = input.businessName;
    if (input.contactPhone) profile.contactPhone = input.contactPhone;

    await profile.save();
    const city = await City.findById(profile.cityId);
    return formatVendorProfile(profile, city?.name);
  }

  public async adminListVendors(status?: VendorStatus): Promise<IVendorProfile[]> {
    const query = status ? { verificationStatus: status } : {};
    const profiles = await VendorProfile.find(query).sort({ createdAt: -1 });

    const cities = await City.find({
      _id: { $in: profiles.map((p) => p.cityId) },
    });
    const cityMap = new Map(cities.map((c) => [c._id.toString(), c.name]));

    return profiles.map((p) => formatVendorProfile(p, cityMap.get(p.cityId.toString())));
  }

  public async adminVerifyVendor(
    vendorId: string,
    input: AdminVerifyVendorInput
  ): Promise<IVendorProfile> {
    const profile = await VendorProfile.findById(vendorId);
    if (!profile) {
      throw new NotFoundError('Vendor profile not found');
    }

    profile.verificationStatus = input.status;
    // Always keep the rejection reason consistent with the new status: retain
    // it only on rejection, clear any stale reason on approval/suspension.
    if (input.status === VENDOR_STATUSES.REJECTED) {
      profile.rejectionReason = input.rejectionReason;
    } else {
      profile.rejectionReason = undefined;
    }

    await profile.save();
    const city = await City.findById(profile.cityId);
    return formatVendorProfile(profile, city?.name);
  }

  public async adminUpdateCommission(
    vendorId: string,
    input: AdminUpdateVendorCommissionInput
  ): Promise<IVendorProfile> {
    if (!mongoose.isValidObjectId(vendorId)) throw new ValidationError('Invalid vendor ID');
    const profile = await VendorProfile.findById(vendorId);
    if (!profile) throw new NotFoundError('Vendor profile not found');
    profile.commissionPercent = input.commissionPercent;
    await profile.save();
    const city = await City.findById(profile.cityId);
    return formatVendorProfile(profile, city?.name);
  }
}

export const vendorService = new VendorService();
