import { z } from 'zod';
import { USER_ROLES } from '../constants/roles.js';

/**
 * Password validation rule:
 * - At least 8 characters
 * - At least 1 lowercase letter
 * - At least 1 uppercase letter
 * - At least 1 digit
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

/**
 * Indian 10-digit mobile number format: begins with 6, 7, 8, or 9
 */
export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
  .optional()
  .or(z.literal(''));

export const registerSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: passwordSchema,
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  phone: phoneSchema,
  // Renter and Vendor can self-register; Admin is strictly CLI seeded
  role: z.enum([USER_ROLES.RENTER, USER_ROLES.VENDOR]).default(USER_ROLES.RENTER),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential token is required'),
});

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
