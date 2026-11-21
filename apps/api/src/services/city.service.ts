import { City, ICityDocument } from '../models/city.model.js';
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
