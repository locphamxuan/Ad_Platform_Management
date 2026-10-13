import { z } from 'zod';
import type { Role } from '../domain/types.js';
import type { SeedPasswords } from '../seed.js';

/** Blank lines in .env (`KEY=`) count as "not set". */
const blankAsUnset = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const required = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankAsUnset, schema);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankAsUnset, schema.optional());

const seedPassword = optional(z.string().min(12, 'SEED_PASSWORD_* must be at least 12 characters'));
const SEED_PASSWORD_KEYS = {
  owner: 'SEED_PASSWORD_OWNER',
  admin: 'SEED_PASSWORD_ADMIN',
  media_buyer: 'SEED_PASSWORD_MEDIA_BUYER',
  client: 'SEED_PASSWORD_CLIENT',
} as const satisfies Record<Role, string>;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017'),
    MONGODB_DB: z.string().min(1).default('adhub'),
    /** Built client (client/dist) to serve from the API port; unset in development (Vite serves it). */
    CLIENT_DIST: optional(z.string().trim().min(1)),
    SEED_PASSWORD_OWNER: seedPassword,
    SEED_PASSWORD_ADMIN: seedPassword,
    SEED_PASSWORD_MEDIA_BUYER: seedPassword,
    SEED_PASSWORD_CLIENT: seedPassword,
  })
  .superRefine((value, ctx) => {
    // Production must never seed the well-known development password.
    if (value.NODE_ENV !== 'production') return;
    for (const key of Object.values(SEED_PASSWORD_KEYS)) {
      if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
  });

/** Validated once at startup: fail fast on bad core configuration. */
export const env = envSchema.parse(process.env);

export const seedPasswords: SeedPasswords = Object.fromEntries(
  Object.entries(SEED_PASSWORD_KEYS).flatMap(([role, key]) => (env[key] ? [[role, env[key]]] : [])),
);

const numericId = (name: string) => z.string().trim().regex(/^\d+$/, `${name} must contain digits only`);

const metaSchema = z.object({
  META_ACCESS_TOKEN: required(z.string().trim().min(20, 'META_ACCESS_TOKEN looks too short')),
  META_APP_SECRET: required(z.string().trim().min(16, 'META_APP_SECRET looks too short')),
  // Ads Manager shows the bare number; the Graph API wants the act_ prefix.
  META_AD_ACCOUNT_ID: required(
    z
      .string()
      .trim()
      .regex(/^(act_)?\d+$/, 'META_AD_ACCOUNT_ID must be the ad account number, with or without act_')
      .transform((id) => (id.startsWith('act_') ? id : `act_${id}`)),
  ),
  META_PAGE_ID: required(numericId('META_PAGE_ID')),
  META_PIXEL_ID: optional(numericId('META_PIXEL_ID')),
  META_API_VERSION: optional(z.string().trim().regex(/^v\d+\.\d+$/, 'META_API_VERSION must look like v23.0')),
});

export type MetaConfig = {
  accessToken: string;
  appSecret: string;
  adAccountId: string;
  pageId: string;
  pixelId?: string;
  apiVersion: string;
};

/**
 * Real platform credentials, or null to keep that platform's mock adapter. The section switches on
 * when its trigger key is set; a half-filled section only warns, so the app still starts for demos.
 */
function loadPlatformSection<S extends z.ZodTypeAny, C>(
  source: NodeJS.ProcessEnv,
  section: { name: string; mock: string; trigger: string; schema: S; toConfig: (values: z.infer<S>) => C },
): C | null {
  if (!source[section.trigger]?.trim()) return null;

  const result = section.schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) =>
      issue.code === 'invalid_type' ? `${issue.path.join('.')} is missing` : issue.message,
    );
    console.warn(
      `[config] ${section.name} disabled, using the mock ${section.mock} adapter:\n  - ${problems.join('\n  - ')}\n` +
        `  Fill these in server/.env (or clear ${section.trigger}) and restart.`,
    );
    return null;
  }
  return section.toConfig(result.data);
}

export const loadMetaConfig = (source: NodeJS.ProcessEnv): MetaConfig | null =>
  loadPlatformSection(source, {
    name: 'Meta Marketing API',
    mock: 'Facebook',
    trigger: 'META_ACCESS_TOKEN',
    schema: metaSchema,
    toConfig: (meta) => ({
      accessToken: meta.META_ACCESS_TOKEN,
      appSecret: meta.META_APP_SECRET,
      adAccountId: meta.META_AD_ACCOUNT_ID,
      pageId: meta.META_PAGE_ID,
      pixelId: meta.META_PIXEL_ID,
      apiVersion: meta.META_API_VERSION ?? 'v23.0',
    }),
  });

const tiktokSchema = z.object({
  TIKTOK_ACCESS_TOKEN: required(z.string().trim().min(20, 'TIKTOK_ACCESS_TOKEN looks too short')),
  TIKTOK_ADVERTISER_ID: required(numericId('TIKTOK_ADVERTISER_ID')),
  TIKTOK_API_BASE: optional(z.string().trim().url('TIKTOK_API_BASE must be a URL')),
});

export type TikTokConfig = { accessToken: string; advertiserId: string; apiBase: string };

export const loadTikTokConfig = (source: NodeJS.ProcessEnv): TikTokConfig | null =>
  loadPlatformSection(source, {
    name: 'TikTok API for Business',
    mock: 'TikTok',
    trigger: 'TIKTOK_ACCESS_TOKEN',
    schema: tiktokSchema,
    toConfig: (t) => ({
      accessToken: t.TIKTOK_ACCESS_TOKEN,
      advertiserId: t.TIKTOK_ADVERTISER_ID,
      apiBase: (t.TIKTOK_API_BASE ?? 'https://business-api.tiktok.com/open_api/v1.3').replace(/\/$/, ''),
    }),
  });

// Google Ads shows customer ids as 123-456-7890; the API wants digits only.
const customerId = (name: string) =>
  z
    .string()
    .trim()
    .transform((id) => id.replace(/-/g, ''))
    .pipe(z.string().regex(/^\d{10}$/, `${name} must be the 10-digit customer id`));

const googleSchema = z.object({
  GOOGLE_ADS_DEVELOPER_TOKEN: required(z.string().trim().min(10, 'GOOGLE_ADS_DEVELOPER_TOKEN looks too short')),
  GOOGLE_ADS_CLIENT_ID: required(z.string().trim().min(10, 'GOOGLE_ADS_CLIENT_ID looks too short')),
  GOOGLE_ADS_CLIENT_SECRET: required(z.string().trim().min(10, 'GOOGLE_ADS_CLIENT_SECRET looks too short')),
  GOOGLE_ADS_REFRESH_TOKEN: required(z.string().trim().min(20, 'GOOGLE_ADS_REFRESH_TOKEN looks too short')),
  GOOGLE_ADS_CUSTOMER_ID: required(customerId('GOOGLE_ADS_CUSTOMER_ID')),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optional(customerId('GOOGLE_ADS_LOGIN_CUSTOMER_ID')),
  GOOGLE_ADS_API_VERSION: optional(z.string().trim().regex(/^v\d+$/, 'GOOGLE_ADS_API_VERSION must look like v21')),
});

export type GoogleAdsConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
  apiVersion: string;
};

export const loadGoogleAdsConfig = (source: NodeJS.ProcessEnv): GoogleAdsConfig | null =>
  loadPlatformSection(source, {
    name: 'Google Ads API',
    mock: 'Google Ads',
    trigger: 'GOOGLE_ADS_DEVELOPER_TOKEN',
    schema: googleSchema,
    toConfig: (g) => ({
      developerToken: g.GOOGLE_ADS_DEVELOPER_TOKEN,
      clientId: g.GOOGLE_ADS_CLIENT_ID,
      clientSecret: g.GOOGLE_ADS_CLIENT_SECRET,
      refreshToken: g.GOOGLE_ADS_REFRESH_TOKEN,
      customerId: g.GOOGLE_ADS_CUSTOMER_ID,
      loginCustomerId: g.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      apiVersion: g.GOOGLE_ADS_API_VERSION ?? 'v21',
    }),
  });

export const metaConfig = loadMetaConfig(process.env);
export const tiktokConfig = loadTikTokConfig(process.env);
export const googleAdsConfig = loadGoogleAdsConfig(process.env);

export interface PlatformCredentials {
  meta: MetaConfig | null;
  tiktok: TikTokConfig | null;
  google: GoogleAdsConfig | null;
}

export const platformCredentials: PlatformCredentials = { meta: metaConfig, tiktok: tiktokConfig, google: googleAdsConfig };
