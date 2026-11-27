import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  USER_ROLES,
  adminOrderSearchSchema,
  adminDamageArbitrationSchema,
  adminCitySchema,
  adminCityUpdateSchema,
  updatePlatformSettingsSchema,
} from '@rentease/shared';
import { adminController } from '../controllers/admin.controller.js';

export const adminRouter = Router();

adminRouter.use(authenticate, authorize(USER_ROLES.ADMIN));
adminRouter.get('/metrics', adminController.metrics);
adminRouter.get(
  '/orders',
  validate({ query: adminOrderSearchSchema }),
  adminController.searchOrders
);
adminRouter.get('/audit', adminController.audit);
adminRouter.patch(
  '/orders/:id/damage',
  validate({ body: adminDamageArbitrationSchema }),
  adminController.arbitrateDamage
);
adminRouter.get('/settings', adminController.settings);
adminRouter.patch(
  '/settings',
  validate({ body: updatePlatformSettingsSchema }),
  adminController.updateSettings
);
adminRouter.get('/cities', adminController.listCities);
adminRouter.post('/cities', validate({ body: adminCitySchema }), adminController.createCity);
adminRouter.patch(
  '/cities/:id',
  validate({ body: adminCityUpdateSchema }),
  adminController.updateCity
);
// NOTE: Payout ledger is served via GET /api/v1/payouts/admin/ledger (no entry limit).
// The duplicate GET /admin/payouts has been removed to avoid confusion.
