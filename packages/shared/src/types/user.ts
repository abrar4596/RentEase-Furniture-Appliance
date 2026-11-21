import { UserRole } from '../constants/roles.js';

export type UserStatus = 'active' | 'suspended' | 'pending_verification';

export interface IUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  authProviders: Array<{
    provider: 'local' | 'google';
    providerId?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface AuthResponse {
  user: IUser;
  accessToken: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  family?: string;
}
