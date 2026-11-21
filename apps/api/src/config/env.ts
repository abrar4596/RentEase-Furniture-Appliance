import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/rentease_dev'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev_jwt_access_secret_min_16_chars!'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev_jwt_refresh_secret_min_16_chars!'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16).default('dev_cookie_secret_at_least_16_chars!'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  CLOUDINARY_CLOUD_NAME: z.string().default('rentease_test_cloud'),
  CLOUDINARY_API_KEY: z.string().default('test_api_key_123456789'),
  CLOUDINARY_API_SECRET: z.string().default('test_api_secret_abcdefghijk'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ FATAL: Invalid environment variable configuration:');
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
