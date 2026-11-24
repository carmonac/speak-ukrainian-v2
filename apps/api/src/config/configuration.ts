import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

/**
 * Environment contract for the API. Validated once at boot so a misconfigured
 * deployment fails fast instead of erroring on the first request.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),

  /** Direct Postgres connection to the Supabase database. */
  DATABASE_URL: z.string().min(1),

  /** Supabase project URL, e.g. `https://xyz.supabase.co` or `http://127.0.0.1:54321`. */
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),

  /** Service-role (secret) key. Server only: it bypasses row level security. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /** Private bucket holding H5P content, libraries and temporary files. */
  STORAGE_BUCKET: z.string().min(1).default('h5p'),

  /** S3-compatible endpoint of Supabase Storage. Defaults to `<SUPABASE_URL>/storage/v1/s3`. */
  STORAGE_S3_ENDPOINT: optionalSecret,
  STORAGE_S3_REGION: z.string().default('local'),
  STORAGE_S3_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1),

  /** Origins allowed to call the API: the admin panel and the student classroom. */
  CORS_ORIGINS: csv('http://localhost:4200,http://localhost:4300'),

  /** Where the public site (this API's `/`) is reachable. */
  PUBLIC_SITE_URL: z.url().default('http://localhost:8080'),
  /** Where the student classroom is served; exposed to page templates as `{{ studentUrl }}`. */
  STUDENT_APP_URL: z.url().default('http://localhost:4300'),
  ADMIN_APP_URL: z.url().default('http://localhost:4200'),

  /**
   * Email of the single administrator. On the first boot with no admin in the
   * project, the API creates this account with a random password and logs it once.
   */
  ADMIN_EMAIL: z.email(),

  /** Where H5P keeps its working files, relative to the app root. */
  H5P_TEMP_DIR: z.string().default('./h5p/temporary-storage'),
  /** Where the H5P client libraries fetched by `scripts/fetch-h5p-core.ts` live. */
  H5P_ASSETS_DIR: z.string().default('./h5p'),
  /**
   * Base URL the H5P client uses to reach this API. Must be absolute whenever
   * the page embedding the player is on another origin, which is always the
   * case here (admin and student apps live on their own subdomains).
   */
  H5P_BASE_URL: z.string().default('http://localhost:8080/api/h5p'),
  /**
   * Signs the short-lived credentials carried in H5P URLs (editor AJAX, and
   * content files of a playing exercise). Required, no default on purpose.
   */
  H5P_URL_TOKEN_SECRET: z.string().min(32),
  /** How long a content or library file may deliver nothing before the API gives up. */
  H5P_STREAM_STALL_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),

  /** Stripe secret key. Without it (outside production) purchases complete instantly. */
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,

  /** SendGrid API key. Without it emails are written to the log instead of sent. */
  SENDGRID_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().default('SpeakUkrainian <no-reply@example.com>'),

  /** Hours an admin chat message may stay unanswered before the student is emailed. */
  CHAT_REMINDER_AFTER_HOURS: z.coerce.number().min(0).default(24),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.STRIPE_SECRET_KEY) {
    throw new Error(
      'Invalid environment configuration:\n  STRIPE_SECRET_KEY: required in production',
    );
  }
  return result.data;
}
