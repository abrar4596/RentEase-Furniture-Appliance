import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API Health & Base Middleware Integration Tests', () => {
  const app = createApp();

  it('GET /health returns 200 with standard response envelope and X-Request-Id', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        status: 'OK',
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        db: expect.stringMatching(/^(connected|connecting|disconnecting|disconnected)$/),
      }),
    });
  });

  it('GET /api/v1/health returns 200 matching versioned route', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('OK');
  });

  it('propagates incoming X-Request-Id if provided', async () => {
    const customId = 'test-custom-request-id-12345';
    const res = await request(app).get('/health').set('X-Request-Id', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('returns standard 404 error envelope for nonexistent route', async () => {
    const res = await request(app).get('/non-existent-route');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist',
      },
    });
  });
});
