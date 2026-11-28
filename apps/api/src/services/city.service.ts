import mongoose from 'mongoose';
import { CreateWaitlistEntryInput, IWaitlistEntry } from '@rentease/shared';
import { City, ICityDocument } from '../models/city.model.js';
import { WaitlistEntry, formatWaitlistEntry } from '../models/waitlist.model.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

export const INITIAL_PILOT_CITIES = [
  {
    name: 'Jaipur',
    state: 'Rajasthan',
    pincodes: ['302001', '302002', '302003', '302004', '302017', '302020', '302021', '302033'],
    isActive: true,
  },
  {
    name: 'Indore',
    state: 'Madhya Pradesh',
    pincodes: ['452001', '452002', '452003', '452010', '452011', '452016', '452020'],
    isActive: true,
  },
  {
    name: 'Lucknow',
    state: 'Uttar Pradesh',
    pincodes: ['226001', '226002', '226010', '226012', '226016', '226024', '226028'],
    isActive: true,
  },
  {
    name: 'Coimbatore',
    state: 'Tamil Nadu',
    pincodes: ['641001', '641002', '641004', '641012', '641018', '641044', '641045'],
    isActive: true,
  },
];

export class CityService {
  public async listCities(activeOnly = true): Promise<ICityDocument[]> {
    const query = activeOnly ? { isActive: true } : {};
    return City.find(query).sort({ name: 1 });
  }

  public async getCityById(cityId: string): Promise<ICityDocument> {
    const city = await City.findById(cityId);
    if (!city) {
      throw new NotFoundError(`City with ID '${cityId}' not found`);
    }
    return city;
  }

  public async isPincodeServiced(cityId: string, pincode: string): Promise<boolean> {
    const city = await City.findOne({ _id: cityId, isActive: true, pincodes: pincode });
    return Boolean(city);
  }

  /**
   * Resolves whether RentEase currently serves a pincode (definitive) or a city
   * (city-level). Used to drive the "not yet in your city" + waitlist flow.
   */
  public async checkServiceability(params: {
    pincode?: string;
    cityId?: string;
  }): Promise<{ serviceable: boolean; city: ICityDocument | null; requestedPincode?: string }> {
    if (params.pincode) {
      const city = await City.findOne({ isActive: true, pincodes: params.pincode });
      return { serviceable: Boolean(city), city: city ?? null, requestedPincode: params.pincode };
    }

    if (params.cityId && mongoose.isValidObjectId(params.cityId)) {
      const city = await City.findOne({ _id: params.cityId, isActive: true });
      return { serviceable: Boolean(city), city: city ?? null };
    }

    return { serviceable: false, city: null };
  }

  /**
   * Captures waitlist interest for a city that is not yet serviceable.
   * Idempotent per city + contact channel so repeat submissions do not duplicate.
   */
  public async joinWaitlist(input: CreateWaitlistEntryInput): Promise<IWaitlistEntry> {
    const contactFilters: Array<Record<string, string>> = [];
    if (input.email) contactFilters.push({ email: input.email });
    if (input.phone) contactFilters.push({ phone: input.phone });

    if (contactFilters.length > 0) {
      const existing = await WaitlistEntry.findOne({
        cityName: input.cityName,
        $or: contactFilters,
      });
      if (existing) {
        return formatWaitlistEntry(existing);
      }
    }

    const created = await WaitlistEntry.create({
      cityName: input.cityName,
      pincode: input.pincode,
      name: input.name,
      email: input.email,
      phone: input.phone,
    });
    logger.info(
      { city: created.cityName, pincode: created.pincode },
      'Waitlist signup captured for unserviceable city'
    );
    return formatWaitlistEntry(created);
  }

  public async seedCities(): Promise<void> {
    for (const cityData of INITIAL_PILOT_CITIES) {
      const existing = await City.findOne({ name: cityData.name });
      if (!existing) {
        await City.create(cityData);
        logger.info({ city: cityData.name }, 'Seeded pilot city');
      }
    }
  }
}

export const cityService = new CityService();
