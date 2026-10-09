import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017'),
  MONGODB_DB: z.string().min(1).default('adhub'),
});

/** Validated once at startup: fail fast on bad configuration. */
export const env = envSchema.parse(process.env);
