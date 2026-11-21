import { Request, Response, NextFunction } from 'express';
import { cityService } from '../services/city.service.js';

export class CityController {
  public async listCities(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cities = await cityService.listCities();
      res.status(200).json({
        success: true,
        data: { cities },
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
        data: { city },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const cityController = new CityController();
