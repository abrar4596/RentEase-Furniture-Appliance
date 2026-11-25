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
  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder_key_id'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_placeholder_key_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_test_webhook_secret_key'),
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(15),
  KYC_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
});

const nonPlaceholder = z
  .string()
  .min(1)
  .refine(
    (value) => !value.toLowerCase().includes('placeholder'),
    'Must not be a placeholder value'
  );

const productionEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.string().url(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('dev_'), 'Must not use a development secret'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('dev_'), 'Must not use a development secret'),
  COOKIE_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('dev_'), 'Must not use a development secret'),
  CLOUDINARY_CLOUD_NAME: nonPlaceholder.refine(
    (value) => value !== 'rentease_test_cloud',
    'Must not use the example Cloudinary cloud'
  ),
  CLOUDINARY_API_KEY: nonPlaceholder.refine(
    (value) => value !== 'test_api_key_123456789',
    'Must not use the example Cloudinary API key'
  ),
  CLOUDINARY_API_SECRET: nonPlaceholder.refine(
    (value) => value !== 'test_api_secret_abcdefghijk',
    'Must not use the example Cloudinary API secret'
  ),
  RAZORPAY_KEY_ID: nonPlaceholder,
  RAZORPAY_KEY_SECRET: nonPlaceholder,
  RAZORPAY_WEBHOOK_SECRET: nonPlaceholder,
});

function reportInvalidEnvironment(error: z.ZodError): never {
  // eslint-disable-next-line no-console
  console.error('❌ FATAL: Invalid environment variable configuration:');
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(error.format(), null, 2));
  process.exit(1);
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  reportInvalidEnvironment(parsed.error);
}

if (parsed.data.NODE_ENV === 'production') {
  const productionParsed = productionEnvSchema.safeParse(process.env);
  if (!productionParsed.success) {
    reportInvalidEnvironment(productionParsed.error);
  }
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
