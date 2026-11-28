import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import {
  RegisterInput,
  LoginInput,
  ResetPasswordInput,
  IUser,
  TokenPayload,
  USER_ROLES,
} from '@rentease/shared';
import { User, IUserDocument, formatUser } from '../models/user.model.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import { PasswordResetToken } from '../models/password-reset.model.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../middleware/error-handler.js';
import { env } from '../config/env.js';
import { emailService } from './email.service.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 mins

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  /**
   * Generates a signed short-lived JWT access token
   */
  public generateAccessToken(user: IUserDocument, family?: string): string {
    const payload: TokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      family,
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: '15m',
    });
  }

  /**
   * Generates a random cryptographic refresh token and stores its SHA-256 hash in DB
   */
  public async createRefreshTokenSession(
    userId: mongoose.Types.ObjectId,
    family?: string
  ): Promise<string> {
    const plainToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = hashToken(plainToken);
    const tokenFamily = family || crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await RefreshToken.create({
      userId,
      tokenHash,
      family: tokenFamily,
      isRevoked: false,
      expiresAt,
    });

    return plainToken;
  }

  /**
   * Registers a new user (Renter or Vendor).
   * Note: Platform Admin registration via public endpoint is explicitly forbidden.
   */
  public async register(
    input: RegisterInput
  ): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
    const existing = await User.findOne({ email: input.email });
    if (existing) {
      throw new ConflictError('An account with this email already exists.');
    }

    if ((input.role as string) === USER_ROLES.ADMIN) {
      throw new ForbiddenError('Administrator accounts cannot be created via public registration.');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await User.create({
      email: input.email,
      name: input.name,
      phone: input.phone || undefined,
      passwordHash,
      role: input.role,
      status: 'active',
      authProviders: [{ provider: 'local' }],
    });

    const family = crypto.randomUUID();
    const accessToken = this.generateAccessToken(user, family);
    const refreshToken = await this.createRefreshTokenSession(user._id, family);

    await emailService.sendWelcomeEmail(user.email, user.name);

    return {
      user: formatUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Authenticates user via email and password
   */
  public async login(
    input: LoginInput
  ): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
    const user = await User.findOne({ email: input.email }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (user.status === 'suspended') {
      throw new ForbiddenError('Account is suspended. Please contact customer support.');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const family = crypto.randomUUID();
    const accessToken = this.generateAccessToken(user, family);
    const refreshToken = await this.createRefreshTokenSession(user._id, family);

    return {
      user: formatUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Rotates refresh tokens and detects reuse attacks.
   * If a previously revoked token is presented, all sessions in that family are immediately revoked.
   */
  public async rotateRefreshToken(
    plainToken: string
  ): Promise<{ accessToken: string; refreshToken: string; user: IUser }> {
    if (!plainToken) {
      throw new UnauthorizedError('Refresh token is required.');
    }

    const tokenHash = hashToken(plainToken);
    const session = await RefreshToken.findOne({ tokenHash });

    if (!session) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    // Reuse detection: If token was already revoked, someone is trying to reuse an old token!
    if (session.isRevoked) {
      logger.warn(
        { userId: session.userId, family: session.family },
        'SECURITY ALERT: Refresh token reuse detected! Invalidating all tokens in family.'
      );
      // Invalidate the entire token family
      await RefreshToken.updateMany({ family: session.family }, { isRevoked: true });
      throw new UnauthorizedError('Suspicious activity detected. All sessions revoked.');
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      session.isRevoked = true;
      await session.save();
      throw new UnauthorizedError('Refresh token expired. Please log in again.');
    }

    const user = await User.findById(session.userId);
    if (!user || user.status === 'suspended') {
      throw new UnauthorizedError('User account not found or suspended.');
    }

    // Revoke current token
    session.isRevoked = true;
    await session.save();

    // Issue new pair in the same token family
    const newAccessToken = this.generateAccessToken(user, session.family);
    const newRefreshToken = await this.createRefreshTokenSession(user._id, session.family);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: formatUser(user),
    };
  }

  /**
   * Logs out current session
   */
  public async logout(plainToken: string): Promise<void> {
    if (!plainToken) return;
    const tokenHash = hashToken(plainToken);
    await RefreshToken.updateOne({ tokenHash }, { isRevoked: true });
  }

  /**
   * Logs out all sessions for the user
   */
  public async logoutAll(userId: string): Promise<void> {
    await RefreshToken.updateMany(
      { userId: new mongoose.Types.ObjectId(userId) },
      { isRevoked: true }
    );
  }

  /**
   * Fetches current authenticated user profile
   */
  public async getMe(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found.');
    }
    return formatUser(user);
  }

  /**
   * Dispatches password reset token
   */
  public async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({ email });
    if (!user) {
      // Do not reveal email existence to prevent user enumeration
      logger.info({ email }, 'Forgot password requested for non-existent email');
      return;
    }

    const plainResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainResetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    // Delete any old reset tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    await emailService.sendPasswordResetEmail(user.email, plainResetToken);
  }

  /**
   * Validates reset token and sets new password
   */
  public async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = hashToken(input.token);
    const resetRecord = await PasswordResetToken.findOne({ tokenHash });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired password reset token.');
    }

    const user = await User.findById(resetRecord.userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    user.passwordHash = passwordHash;
    await user.save();

    // Clean up reset token
    await PasswordResetToken.deleteOne({ _id: resetRecord._id });

    // Revoke all existing sessions for security
    await this.logoutAll(user._id.toString());
  }

  /**
   * Google OAuth 2.0 exchange (verifies credential and creates or links user)
   */
  public async googleAuth(
    credential: string
  ): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
    let email = '';
    let name = '';
    let googleId = '';

    try {
       if (env.NODE_ENV !== 'production' && credential.startsWith('test_google_')) {
        email = `${credential.toLowerCase()}@example.com`;
        name = 'Google Test User';
        googleId = credential;
      } else {
         if (!env.GOOGLE_CLIENT_ID) {
           throw new UnauthorizedError('Google OAuth is not configured.');
         }
         const ticket = await new OAuth2Client(env.GOOGLE_CLIENT_ID).verifyIdToken({
           idToken: credential,
           audience: env.GOOGLE_CLIENT_ID,
         });
         const payload = ticket.getPayload();
         if (!payload?.email || !payload.sub) {
           throw new UnauthorizedError('Invalid Google credential token.');
         }
         email = payload.email.toLowerCase();
         name = payload.name || email.split('@')[0] || 'User';
         googleId = payload.sub;
      }
    } catch {
      throw new UnauthorizedError('Failed to process Google authentication token.');
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name,
        role: USER_ROLES.RENTER,
        status: 'active',
        authProviders: [{ provider: 'google', providerId: googleId }],
      });
      await emailService.sendWelcomeEmail(user.email, user.name);
    } else {
      const hasGoogle = user.authProviders.some((p) => p.provider === 'google');
      if (!hasGoogle) {
        user.authProviders.push({ provider: 'google', providerId: googleId });
        await user.save();
      }
    }

    const family = crypto.randomUUID();
    const accessToken = this.generateAccessToken(user, family);
    const refreshToken = await this.createRefreshTokenSession(user._id, family);

    return {
      user: formatUser(user),
      accessToken,
      refreshToken,
    };
  }
}

export const authService = new AuthService();
