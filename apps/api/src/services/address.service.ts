import mongoose from 'mongoose';
import { AddressInput, AddressUpdateInput, IAddress } from '@rentease/shared';
import { Address, formatAddress } from '../models/address.model.js';
import { City } from '../models/city.model.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

export class AddressService {
  /** Pincode must fall inside an active service zone (a live city). */
  private async assertServiceablePincode(pincode: string): Promise<void> {
    const city = await City.findOne({ isActive: true, pincodes: pincode });
    if (!city) throw new ValidationError('This pincode is outside our current service zone');
  }

  public async list(userId: string): Promise<IAddress[]> {
    const addresses = await Address.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({
      isDefault: -1,
      createdAt: -1,
    });
    return addresses.map(formatAddress);
  }

  public async create(userId: string, input: AddressInput): Promise<IAddress> {
    await this.assertServiceablePincode(input.pincode);
    const owner = new mongoose.Types.ObjectId(userId);
    const existing = await Address.countDocuments({ userId: owner });
    // The first saved address becomes the default automatically.
    const isDefault = input.isDefault ?? existing === 0;
    if (isDefault) {
      await Address.updateMany({ userId: owner }, { $set: { isDefault: false } });
    }
    const address = await Address.create({ userId: owner, ...input, isDefault });
    return formatAddress(address);
  }

  public async update(
    userId: string,
    addressId: string,
    input: AddressUpdateInput
  ): Promise<IAddress> {
    if (!mongoose.isValidObjectId(addressId)) throw new ValidationError('Invalid address ID');
    const owner = new mongoose.Types.ObjectId(userId);
    const address = await Address.findOne({ _id: addressId, userId: owner });
    if (!address) throw new NotFoundError('Address not found');

    if (input.pincode && input.pincode !== address.pincode) {
      await this.assertServiceablePincode(input.pincode);
    }
    if (input.isDefault) {
      await Address.updateMany(
        { userId: owner, _id: { $ne: address._id } },
        { $set: { isDefault: false } }
      );
    }
    Object.assign(address, input);
    await address.save();
    return formatAddress(address);
  }

  public async remove(userId: string, addressId: string): Promise<void> {
    if (!mongoose.isValidObjectId(addressId)) throw new ValidationError('Invalid address ID');
    const owner = new mongoose.Types.ObjectId(userId);
    const address = await Address.findOneAndDelete({ _id: addressId, userId: owner });
    if (!address) throw new NotFoundError('Address not found');

    // Promote another address to default so the book is never left without one.
    if (address.isDefault) {
      const next = await Address.findOne({ userId: owner }).sort({ createdAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
  }
}

export const addressService = new AddressService();
