import { z } from 'zod';

export const USER_ROLES = {
  RENTER: 'renter',
  VENDOR: 'vendor',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const userRoleSchema = z.enum([USER_ROLES.RENTER, USER_ROLES.VENDOR, USER_ROLES.ADMIN]);

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && Object.values(USER_ROLES).includes(role as UserRole);
}
