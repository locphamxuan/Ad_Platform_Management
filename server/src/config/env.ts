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
 * Real Meta credentials, or null to keep the mock Facebook adapter. A half-filled
 * Meta section only warns: the rest of the app must still start for local demos.
 */
function loadMetaConfig(source: NodeJS.ProcessEnv): MetaConfig | null {
  if (!source.META_ACCESS_TOKEN?.trim()) return null;

  const result = metaSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) =>
      issue.code === 'invalid_type' ? `${issue.path.join('.')} is missing` : issue.message,
    );
    console.warn(
      `[config] Meta Marketing API disabled, using the mock Facebook adapter:\n  - ${problems.join('\n  - ')}\n` +
        `  Fill these in server/.env (or clear META_ACCESS_TOKEN) and restart.`,
    );
    return null;
  }

  const meta = result.data;
  return {
    accessToken: meta.META_ACCESS_TOKEN,
    appSecret: meta.META_APP_SECRET,
    adAccountId: meta.META_AD_ACCOUNT_ID,
    pageId: meta.META_PAGE_ID,
    pixelId: meta.META_PIXEL_ID,
    apiVersion: meta.META_API_VERSION ?? 'v23.0',
  };
}

export const metaConfig = loadMetaConfig(process.env);
