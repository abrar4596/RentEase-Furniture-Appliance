import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { getTestMongoUri } from './global-setup.js';
import { USER_ROLES } from '@rentease/shared';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { RefreshToken } from '../src/models/refresh-token.model.js';
import { PasswordResetToken } from '../src/models/password-reset.model.js';
import { authService } from '../src/services/auth.service.js';
import { emailService, MockEmailService } from '../src/services/email.service.js';

describe('Phase 1: Authentication & RBAC Integration Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    await mongoose.connect(getTestMongoUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await RefreshToken.deleteMany({});
    await PasswordResetToken.deleteMany({});
  });

  it('accepts only test Google credentials outside verified production mode', async () => {
    const response = await request(app).post('/api/v1/auth/google').send({
      credential: 'test_google_phase10',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('test_google_phase10@example.com');

    const forged = await request(app).post('/api/v1/auth/google').send({
      credential: 'eyJhbGciOiJub25lIn0.eyJlbWFpbCI6ImFkbWluQHJlbnRlYXNlLnRlc3QifQ.',
    });
    expect(forged.status).toBe(401);
  });

  describe('User Registration', () => {
    it('registers a new renter successfully with hashed password and tokens', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'renter@example.com',
        password: 'Password@123',
        name: 'Rahul Sharma',
        phone: '9876543210',
        role: USER_ROLES.RENTER,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toMatchObject({
        email: 'renter@example.com',
        name: 'Rahul Sharma',
        role: USER_ROLES.RENTER,
        status: 'active',
      });
      expect(res.body.data.accessToken).toBeDefined();

      // Refresh token must be in httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(
        cookies.some((c: string) => c.includes('refreshToken=') && c.includes('HttpOnly'))
      ).toBe(true);

      // Verify password was hashed in DB
      const userInDb = await User.findOne({ email: 'renter@example.com' }).select('+passwordHash');
      expect(userInDb?.passwordHash).toBeDefined();
      expect(userInDb?.passwordHash).not.toBe('Password@123');
    });

    it('registers a local vendor successfully', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'vendor@example.com',
        password: 'Password@123',
        name: 'Jaipur Furniture Hub',
        role: USER_ROLES.VENDOR,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe(USER_ROLES.VENDOR);
    });

    it('strictly forbids public registration with admin role', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'hacker@example.com',
        password: 'Password@123',
        name: 'Malicious Admin Attempt',
        role: USER_ROLES.ADMIN,
      });

      expect(res.status).toBe(400); // Caught by Zod validator
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects registration with weak password or invalid email', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'not-an-email',
        password: 'weak',
        name: 'Test',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate email registration', async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password@123',
        name: 'Original User',
      });

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password@123',
        name: 'Duplicate Attempt',
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('User Login & Session Retrieval', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'user@example.com',
        password: 'Password@123',
        name: 'Regular User',
      });
    });

    it('logs in successfully with correct credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'user@example.com',
        password: 'Password@123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('user@example.com');
    });

    it('rejects login with wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'user@example.com',
        password: 'WrongPassword@123',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects login for non-existent email', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'Password@123',
      });

      expect(res.status).toBe(401);
    });

    it('fetches authenticated user profile via GET /api/v1/auth/me', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'user@example.com',
        password: 'Password@123',
      });

      const token = loginRes.body.data.accessToken;

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.email).toBe('user@example.com');
    });
  });

  describe('Token Rotation & Reuse Detection Security', () => {
    it('rotates refresh token and issues a new access token on valid refresh', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'rotate@example.com',
        password: 'Password@123',
        name: 'Rotation Tester',
      });

      const initialCookie = regRes.headers['set-cookie'][0];
      const refreshTokenValue = initialCookie.split(';')[0].split('=')[1];

      // Request token refresh
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshTokenValue}`]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();

      const newCookie = refreshRes.headers['set-cookie'][0];
      const newRefreshTokenValue = newCookie.split(';')[0].split('=')[1];

      // New token must be different from initial token
      expect(newRefreshTokenValue).not.toBe(refreshTokenValue);
    });

    it('REUSE DETECTION: immediately invalidates family if an already-used refresh token is presented', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'reuse@example.com',
        password: 'Password@123',
        name: 'Reuse Tester',
      });

      const initialCookie = regRes.headers['set-cookie'][0];
      const originalRefreshToken = initialCookie.split(';')[0].split('=')[1];

      // Legitimate user rotates token
      const refreshRes1 = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${originalRefreshToken}`]);
      expect(refreshRes1.status).toBe(200);

      const latestCookie = refreshRes1.headers['set-cookie'][0];
      const latestRefreshToken = latestCookie.split(';')[0].split('=')[1];

      // ATTACKER (or replay): attempts to use the original (now revoked) token!
      const attackRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${originalRefreshToken}`]);

      expect(attackRes.status).toBe(401);
      expect(attackRes.body.error.message).toContain('Suspicious activity detected');

      // Now even the latest token must be revoked because entire family was compromised!
      const subsequentRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${latestRefreshToken}`]);

      expect(subsequentRes.status).toBe(401);
    });
  });

  describe('Role-Based Access Control (RBAC) Matrix', () => {
    let renterToken: string;
    let vendorToken: string;
    let adminToken: string;

    beforeEach(async () => {
      // 1. Renter
      const renterRes = await request(app).post('/api/v1/auth/register').send({
        email: 'renter-rbac@example.com',
        password: 'Password@123',
        name: 'Renter One',
        role: USER_ROLES.RENTER,
      });
      renterToken = renterRes.body.data.accessToken;

      // 2. Vendor
      const vendorRes = await request(app).post('/api/v1/auth/register').send({
        email: 'vendor-rbac@example.com',
        password: 'Password@123',
        name: 'Vendor One',
        role: USER_ROLES.VENDOR,
      });
      vendorToken = vendorRes.body.data.accessToken;

      // 3. Admin (Direct DB creation to simulate seed)
      const admin = await User.create({
        email: 'admin-rbac@example.com',
        name: 'Admin One',
        passwordHash: 'dummy_hash',
        role: USER_ROLES.ADMIN,
        status: 'active',
        authProviders: [{ provider: 'local' }],
      });
      adminToken = authService.generateAccessToken(admin);
    });

    it('prevents Renter from accessing Vendor and Admin endpoints (403 Forbidden)', async () => {
      const vendorEndpoint = await request(app)
        .get('/api/v1/auth/test/vendor-only')
        .set('Authorization', `Bearer ${renterToken}`);
      expect(vendorEndpoint.status).toBe(403);

      const adminEndpoint = await request(app)
        .get('/api/v1/auth/test/admin-only')
        .set('Authorization', `Bearer ${renterToken}`);
      expect(adminEndpoint.status).toBe(403);
    });

    it('allows Vendor to access Vendor endpoint but forbids Admin endpoint', async () => {
      const vendorEndpoint = await request(app)
        .get('/api/v1/auth/test/vendor-only')
        .set('Authorization', `Bearer ${vendorToken}`);
      expect(vendorEndpoint.status).toBe(200);

      const adminEndpoint = await request(app)
        .get('/api/v1/auth/test/admin-only')
        .set('Authorization', `Bearer ${vendorToken}`);
      expect(adminEndpoint.status).toBe(403);
    });

    it('allows Admin to access Admin endpoint', async () => {
      const adminEndpoint = await request(app)
        .get('/api/v1/auth/test/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminEndpoint.status).toBe(200);
    });
  });

  describe('Password Reset Flow', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'reset-test@example.com',
        password: 'Password@123',
        name: 'Reset Tester',
      });
    });

    it('initiates forgot-password and resets password with token', async () => {
      // 1. Forgot password request
      const forgotRes = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'reset-test@example.com',
      });
      expect(forgotRes.status).toBe(200);

      // Check reset token in DB
      const user = await User.findOne({ email: 'reset-test@example.com' });
      const resetRecord = await PasswordResetToken.findOne({ userId: user?._id });
      expect(resetRecord).toBeDefined();

      // Retrieve generated token from mock email service
      const lastEmail = (emailService as unknown as MockEmailService).getLastEmail();
      expect(lastEmail).toBeDefined();
      const tokenMatch = lastEmail?.body.match(/token: ([a-f0-9]+)/);
      expect(tokenMatch).not.toBeNull();
      const plainToken = tokenMatch![1];

      // 2. Perform reset with new password
      const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
        token: plainToken,
        newPassword: 'NewPassword@456',
      });
      expect(resetRes.status).toBe(200);

      // 3. Old password should fail
      const oldLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'reset-test@example.com',
        password: 'Password@123',
      });
      expect(oldLogin.status).toBe(401);

      // 4. New password succeeds
      const newLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'reset-test@example.com',
        password: 'NewPassword@456',
      });
      expect(newLogin.status).toBe(200);
    });
  });
});
