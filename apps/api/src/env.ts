import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  /** Reverse proxies in front of the API (web nginx = 1; add one per load balancer). Drives req.ip. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  SIGNING_SESSION_SECRET: z.string().min(32),
  WEB_URL: z.url(),
  API_URL: z.url(),
  BUSINESS_NAME: z.string().min(1),
  TOKEN_TTL_HOURS: z.coerce.number().positive().default(72),

  S3_ENDPOINT: z
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // R2 encrypts at rest itself and rejects the SSE header, so it can be turned off.
  S3_SSE: z.enum(['AES256', 'none']).default('AES256'),

  /** console (dev: prints to the log) | zeptomail */
  EMAIL_PROVIDER: z.enum(['console', 'zeptomail']).default('console'),
  ZEPTOMAIL_API_KEY: z.string().optional(),
  ZEPTOMAIL_API_HOST: z.string().default('api.zeptomail.in'),
  /** Sender address, on a domain verified in ZeptoMail. */
  EMAIL_FROM: z.email().default('noreply@gb.zoltanvisa.com'),
  /** Reply-to address and the contact shown to customers. */
  SUPPORT_EMAIL: z.email().default('support@zoltanvisa.com'),

  /** console (dev: prints to the log) | msg91 */
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  /** Phone prefixes that get the code by SMS (DLT covers India); everyone else gets it by email. */
  SMS_COUNTRY_CODES: z
    .string()
    .default('+91')
    .transform((v) =>
      v
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    ),

  /** Shared parent domain for the staff cookies when web and API are on sibling subdomains, e.g. .zoltanvisa.com */
  COOKIE_DOMAIN: z.string().optional(),

  /** on: nightly pg_dump of the database to the bucket (needs pg_dump, present in the API image). */
  DB_BACKUPS: z.enum(['on', 'off']).default('off'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  /** Years after signing (or creation, if never signed) before a record is flagged for deletion. */
  RETENTION_YEARS: z.coerce.number().positive().default(3),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print only variable names, never values.
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}
const d = parsed.data;
const required: [boolean, string[]][] = [
  [d.EMAIL_PROVIDER === 'zeptomail', ['ZEPTOMAIL_API_KEY']],
  [d.SMS_PROVIDER === 'msg91', ['MSG91_AUTH_KEY', 'MSG91_OTP_TEMPLATE_ID']],
];
const missing = required.flatMap(([on, keys]) =>
  on ? keys.filter((k) => !d[k as keyof typeof d]) : [],
);
if (missing.length) {
  console.error('Missing settings:', missing.join(', '));
  process.exit(1);
}
// SMS_COUNTRY_CODES= (empty) sends every code by email, e.g. while DLT registration is pending;
// then no SMS provider is needed.
const smsUsed = d.SMS_COUNTRY_CODES.length > 0;
if (
  d.NODE_ENV === 'production' &&
  (d.EMAIL_PROVIDER === 'console' || (smsUsed && d.SMS_PROVIDER === 'console'))
) {
  // Console providers log signing links and codes; never allow them where real customers exist.
  console.error(
    'EMAIL_PROVIDER (and SMS_PROVIDER, when SMS_COUNTRY_CODES is set) must not be "console" in production',
  );
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
