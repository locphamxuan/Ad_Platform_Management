import { z } from 'zod';
import { daysAgo, today } from '../domain/dates.js';
import { OBJECTIVES, PLATFORMS, ROLES, RULE_ACTIONS, RULE_METRICS, RULE_OPERATORS } from '../domain/types.js';

const DEFAULT_RANGE_DAYS = 7;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const platformSchema = z.enum(PLATFORMS);

export const dateRangeSchema = z.object({
  from: isoDate.default(() => daysAgo(DEFAULT_RANGE_DAYS - 1)),
  to: isoDate.default(today),
});

export const campaignListQuerySchema = dateRangeSchema.extend({
  platform: platformSchema.optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
});

export const campaignPatchSchema = z
  .object({
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
    dailyBudget: z.number().int().positive().optional(),
  })
  .refine((v) => v.status !== undefined || v.dailyBudget !== undefined, 'Nothing to update');

export const bulkCampaignStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(['ACTIVE', 'PAUSED']),
});

export const unifiedCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  objective: z.enum(OBJECTIVES),
  totalDailyBudget: z.number().int().positive(),
  allocations: z
    .array(z.object({ platform: platformSchema, percent: z.number().positive().max(100) }))
    .min(1),
  creative: z.object({
    headline: z.string().trim().min(1).max(100),
    primaryText: z.string().trim().min(1).max(500),
    landingUrl: z.string().url(),
  }),
});

export const ruleSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    enabled: z.boolean().default(true),
    platform: z.union([platformSchema, z.literal('all')]).default('all'),
    condition: z.object({
      metric: z.enum(RULE_METRICS),
      operator: z.enum(RULE_OPERATORS),
      threshold: z.number().nonnegative(),
      lookbackDays: z.number().int().min(1).max(30).default(3),
    }),
    action: z.object({
      type: z.enum(RULE_ACTIONS),
      value: z.number().positive().max(100).optional(),
    }),
  })
  .refine(
    (r) => !r.action.type.endsWith('_budget') || r.action.value !== undefined,
    'Budget actions require a percent value',
  );

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const settingsSchema = z.object({
  /** null switches the cap off */
  buyerDailyBudgetLimit: z.number().int().positive().nullable(),
});

const roleSchema = z.enum(ROLES);
const userNameSchema = z.string().trim().min(2).max(80);

const emailSchema = z.string().trim().email('Email không hợp lệ');
const newPasswordSchema = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128);

export const createUserSchema = z.object({
  email: emailSchema,
  name: userNameSchema,
  role: roleSchema,
  password: newPasswordSchema,
});

export const updateProfileSchema = z
  .object({ name: userNameSchema.optional(), email: emailSchema.optional(), currentPassword: z.string().max(128).optional() })
  .refine((v) => v.name !== undefined || v.email !== undefined, 'Nothing to update');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
});

export const updateUserSchema = z
  .object({ name: userNameSchema.optional(), role: roleSchema.optional(), active: z.boolean().optional() })
  .refine((v) => Object.values(v).some((field) => field !== undefined), 'Nothing to update');
