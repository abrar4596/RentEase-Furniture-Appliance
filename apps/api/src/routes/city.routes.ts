import { Router } from 'express';
import { cityController } from '../controllers/city.controller.js';

export const cityRouter = Router();

cityRouter.get('/', cityController.listCities);
cityRouter.get('/:id', cityController.getCity);
