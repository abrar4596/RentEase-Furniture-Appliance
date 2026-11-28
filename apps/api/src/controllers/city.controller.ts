import { Request, Response, NextFunction } from 'express';
import { ServiceabilityQueryInput, CreateWaitlistEntryInput } from '@rentease/shared';
import { cityService } from '../services/city.service.js';
import { formatCity } from '../models/city.model.js';

export class CityController {
  public async listCities(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cities = (await cityService.listCities()).map(formatCity);
      res.status(200).json({
        success: true,
        data: { cities },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /cities/serviceability?pincode=302001 | ?cityId=...
   * Query already coerced by serviceabilityQuerySchema at the route level.
   */
  public async checkServiceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pincode, cityId } = req.query as unknown as ServiceabilityQueryInput;
      const { serviceable, city, requestedPincode } = await cityService.checkServiceability({
        pincode,
        cityId,
      });
      res.status(200).json({
        success: true,
        data: {
          serviceable,
          city: city ? formatCity(city) : null,
          ...(requestedPincode ? { requestedPincode } : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public async joinWaitlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await cityService.joinWaitlist(req.body as CreateWaitlistEntryInput);
      res.status(201).json({
        success: true,
        data: { entry },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getCity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const city = await cityService.getCityById(id);
      res.status(200).json({
        success: true,
        data: { city: formatCity(city) },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const cityController = new CityController();
