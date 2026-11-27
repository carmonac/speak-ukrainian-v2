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

  /**
   * The gateway's bridge to Cloudflare D1 and R2 (apps/gateway). In the container the
   * gateway sets it to `http://gateway.internal`; on a developer machine it is
   * `wrangler dev`.
   */
  BRIDGE_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:8787/__bridge'),
  /** Shared with the gateway's `.dev.vars`. Only needed outside the container. */
  BRIDGE_SECRET: optionalSecret,

  /** Signs session tokens. Required, no default on purpose: `openssl rand -base64 48`. */
  AUTH_SECRET: z.string().min(32),

  /** Origins allowed to call the API: the admin panel and the student classroom. */
  CORS_ORIGINS: csv('http://localhost:4200,http://localhost:4300'),

  /** Where the public site (this API's `/`) is reachable. */
  PUBLIC_SITE_URL: z.url().default('http://localhost:8080'),
  /** Where the student classroom is served; exposed to page templates as `{{ studentUrl }}`. */
  STUDENT_APP_URL: z.url().default('http://localhost:4300'),
  ADMIN_APP_URL: z.url().default('http://localhost:4200'),

  /**
   * Email of the single administrator. On the first boot with no admin in the
   * database, the API creates this account with the default password.
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

  /**
   * `send` hands emails to Cloudflare Email Sending through the gateway;
   * `log` only writes them to the log. The gateway sets `send` in production.
   */
  EMAIL_DELIVERY: z.enum(['send', 'log']).default('log'),
  /** Must be an address of the domain onboarded in Cloudflare Email Sending. */
  EMAIL_FROM: z.string().default('SpeakUkrainian <no-reply@speakukrainian.org>'),

  /**
   * Shared with the gateway, whose daily Cron Trigger presents it to
   * `POST /api/internal/chat-reminders`. Without it that endpoint is off.
   */
  CRON_SECRET: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined))
    .refine((value) => value === undefined || value.length >= 16, 'at least 16 characters'),

  /** Hours an admin chat message may stay unanswered before the student is emailed. */
  CHAT_REMINDER_AFTER_HOURS: z.coerce.number().min(0).default(24),
});

export type Env = z.infer<typeof envSchema>;

/**
 * The single validation path, used by `ConfigModule.forRoot({ validate })`.
 * The error lists every invalid variable with its path, so one failed boot
 * shows everything that needs fixing.
 *
 * `STRIPE_SECRET_KEY` is deliberately not required in production: without it
 * the API still boots and `PaymentsService` refuses paid checkouts (503) while
 * free courses keep working. Requiring it here would take the whole site down
 * until payments go live.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
