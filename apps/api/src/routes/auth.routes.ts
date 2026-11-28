import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleAuthSchema,
  USER_ROLES,
} from '@rentease/shared';
import { authController, validateRefreshOrigin } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { env } from '../config/env.js';

export const authRouter = Router();

// Strict rate limiter for sensitive authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
  },
});

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register
);

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);

authRouter.post('/refresh', validateRefreshOrigin, authController.refresh);

authRouter.post('/logout', validateRefreshOrigin, authController.logout);

authRouter.post('/logout-all', authenticate, authController.logoutAll);

authRouter.get('/me', authenticate, authController.getMe);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword
);

authRouter.post(
  '/google',
  authLimiter,
  validate({ body: googleAuthSchema }),
  authController.googleAuth
);

// Internal role-verification routes for RBAC testing
authRouter.get('/test/vendor-only', authenticate, authorize(USER_ROLES.VENDOR), (_req, res) => {
  res.json({ success: true, data: { access: 'vendor-granted' } });
});

authRouter.get('/test/admin-only', authenticate, authorize(USER_ROLES.ADMIN), (_req, res) => {
  res.json({ success: true, data: { access: 'admin-granted' } });
});
