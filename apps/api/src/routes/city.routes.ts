import { Router } from 'express';
import { serviceabilityQuerySchema, createWaitlistEntrySchema } from '@rentease/shared';
import { cityController } from '../controllers/city.controller.js';
import { validate } from '../middleware/validate.js';

export const cityRouter = Router();

cityRouter.get('/', cityController.listCities);

// NOTE: static paths must be declared before the '/:id' param route.
cityRouter.get(
  '/serviceability',
  validate({ query: serviceabilityQuerySchema }),
  cityController.checkServiceability
);
cityRouter.post(
  '/waitlist',
  validate({ body: createWaitlistEntrySchema }),
  cityController.joinWaitlist
);

cityRouter.get('/:id', cityController.getCity);
