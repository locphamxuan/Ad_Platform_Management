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

const campaignIdsSchema = z.array(z.string().min(1)).min(1).max(200);

export const bulkCampaignStatusSchema = z.object({
  ids: campaignIdsSchema,
  status: z.enum(['ACTIVE', 'PAUSED']),
});

export const bulkCampaignDeleteSchema = z.object({ ids: campaignIdsSchema });

export const creativeSchema = z.object({
  headline: z.string().trim().min(1).max(100),
  primaryText: z.string().trim().min(1).max(500),
  landingUrl: z.string().url(),
  imageId: z.string().optional(),
  cta: z.string().optional(),
});

export const copyCampaignSchema = z.object({
  accountId: z.string().trim().min(1).max(100).optional(),
  platform: platformSchema.optional(),
  creative: creativeSchema.optional(),
  move: z.boolean().optional(),
});

export const unifiedCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  objective: z.enum(OBJECTIVES),
  totalDailyBudget: z.number().int().positive(),
  allocations: z
    .array(z.object({ platform: platformSchema, percent: z.number().positive().max(100) }))
    .min(1),
  creative: creativeSchema,
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

export const pageRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hasInstagram: z.boolean().optional(),
  isAdvertisingAllowed: z.boolean().optional(),
});

export const audienceLocationSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
});

export const audienceSchema = z.object({
  locations: z.union([z.literal('VN'), z.array(audienceLocationSchema)]),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  genders: z.array(z.enum(['MALE', 'FEMALE'])),
});

export const campaignScheduleSchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const campaignDraftPayloadSchema = z.object({
  name: z.string().trim().max(120).optional(),
  objective: z.enum(OBJECTIVES).optional(),
  platforms: z.array(platformSchema).min(1).optional(),
  totalDailyBudget: z.number().int().positive().optional(),
  allocations: z.array(z.object({ platform: platformSchema, percentage: z.number() })).optional(),
  creative: z.object({
    headline: z.string().trim().max(100).optional(),
    primaryText: z.string().trim().max(500).optional(),
    landingUrl: z.string().optional(),
    imageId: z.string().optional(),
    cta: z.string().optional(),
  }).optional(),
  pages: z.array(pageRefSchema).max(10).optional(),
  audience: audienceSchema.optional(),
  schedule: campaignScheduleSchema.optional(),
  specialCategory: z.enum(['NONE', 'HOUSING']).optional(),
  accountId: z.string().optional(),
  acknowledgeNationwide: z.boolean().optional(),
}).passthrough();

export const createDraftSchema = z.object({
  step: z.number().int().min(1).max(7).default(1),
  payload: campaignDraftPayloadSchema.default({}),
});

export const updateDraftSchema = z.object({
  revision: z.number().int().positive(),
  step: z.number().int().min(1).max(7).optional(),
  payload: campaignDraftPayloadSchema.optional(),
});

export const mediaUploadSchema = z.object({
  fileName: z.string().min(1),
  dataBase64: z.string().min(1),
});
