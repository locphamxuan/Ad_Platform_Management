export const PLATFORMS = ['facebook', 'tiktok', 'google'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const OBJECTIVES = ['awareness', 'traffic', 'engagement', 'leads', 'app_promotion', 'sales'] as const;
export type Objective = (typeof OBJECTIVES)[number];

export type CampaignStatus = 'ACTIVE' | 'PAUSED';

export interface Creative {
  headline: string;
  primaryText: string;
  landingUrl: string;
  imageId?: string;
  cta?: string;
}

export interface PageRef {
  id: string;
  name: string;
  hasInstagram?: boolean;
  isAdvertisingAllowed?: boolean;
}

export interface AudienceLocation {
  key: string;
  name: string;
  type: string;
}

export interface Audience {
  locations: AudienceLocation[] | 'VN';
  ageMin: number;
  ageMax: number;
  genders: Array<'MALE' | 'FEMALE'>;
}

export interface CampaignSchedule {
  startTime?: string;
  endTime?: string;
}

export type SpecialCategory = 'NONE' | 'HOUSING';

export interface CampaignAdMeta {
  adId: string;
  pageId: string;
  creativeId?: string;
  review?: {
    status: string;
    reason?: string;
  };
}

export interface CampaignMetaInfo {
  adSetId?: string;
  ads: CampaignAdMeta[];
  effectiveStatus?: string;
  deletedOnMeta?: boolean;
  syncedAt?: string;
}

export interface Integration {
  platform: Platform;
  connected: boolean;
  accountId?: string;
  accountName?: string;
  connectedAt?: string;
  /** Whether the account was authorised against the real platform API (absent = simulated). */
  live?: boolean;
}

export interface Campaign {
  id: string;
  platform: Platform;
  externalId: string;
  name: string;
  objective: Objective;
  platformObjective: string;
  status: CampaignStatus;
  /** Daily budget in VND */
  dailyBudget: number;
  unifiedCampaignId?: string;
  creative?: Creative;
  /** Ad account the campaign runs in; absent = the integration's own account (campaigns made before multi-account) */
  accountId?: string;
  /** Set when the campaign was moved to another account: the id of the campaign that took over */
  replacedBy?: string;
  pages?: PageRef[];
  audience?: Audience;
  schedule?: CampaignSchedule;
  specialCategory?: SpecialCategory;
  draftId?: string;
  meta?: CampaignMetaInfo;
  createdAt: string;
}

export type CampaignDraftState =
  | 'DRAFT'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PARTIAL'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'NEEDS_RECONCILE'
  | 'NEEDS_REVIEW';

export interface CampaignDraftPayload {
  name: string;
  objective: Objective;
  platforms: Platform[];
  totalDailyBudget: number;
  allocations: Array<{ platform: Platform; percentage?: number; percent?: number }>;
  creative: Creative;
  pages: PageRef[];
  audience: Audience;
  schedule: CampaignSchedule;
  specialCategory: SpecialCategory;
  accountId?: string;
  acknowledgeNationwide?: boolean;

  // Expert Mode & A/B testing extensions
  buying_type?: 'AUCTION' | 'RESERVED';
  setup_mode?: 'recommended' | 'manual';
  ab_plan?: Record<string, any>;
  placements?: Record<string, any>;
  advanced?: Record<string, any>;
  budget?: Record<string, any>;
}

export interface CheckLevelResult {
  level: 'CAMPAIGN' | 'AD_SET' | 'AD_CREATIVE' | 'AD';
  pageId?: string;
  status: 'PASSED' | 'FAILED';
  code?: string;
  message?: string;
}

export interface CampaignDraftCheck {
  revision: number;
  at: string;
  levels: CheckLevelResult[];
}

export interface CampaignDraftSubmission {
  idempotencyKey: string;
  tag: string;
  startedAt: string;
  results?: {
    campaignId?: string;
    platformIds?: Partial<Record<Platform, string>>;
    metaCampaignId?: string;
  };
  error?: {
    level?: string;
    pageId?: string;
    metaCode?: number | string;
    message: string;
    fix?: string;
  };
}

export interface CampaignDraft {
  id: string;
  ownerId: string;
  revision: number;
  state: CampaignDraftState;
  step: number;
  payload: CampaignDraftPayload;
  check?: CampaignDraftCheck;
  submission?: CampaignDraftSubmission;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  sha256: string;
  metaHashes: Record<string, string>;
  data?: string;
  createdAt: string;
}

/** One ad account the connected login can run campaigns in. */
export interface AdAccount {
  id: string;
  name: string;
  /** False when the platform has disabled the account; it cannot deliver ads */
  active: boolean;
  /** Lifetime spending limit in VND; null = no limit */
  spendCap: number | null;
  /** Lifetime spend in VND as reported by the platform; null = unknown */
  amountSpent: number | null;
}

export interface MetricDaily {
  campaignId: string;
  /** YYYY-MM-DD */
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export const RULE_METRICS = ['cpa', 'roas', 'spend', 'ctr'] as const;
export type RuleMetric = (typeof RULE_METRICS)[number];

export const RULE_OPERATORS = ['gt', 'lt'] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const RULE_ACTIONS = ['pause', 'activate', 'increase_budget', 'decrease_budget'] as const;
export type RuleActionType = (typeof RULE_ACTIONS)[number];

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  platform: Platform | 'all';
  condition: {
    metric: RuleMetric;
    operator: RuleOperator;
    threshold: number;
    lookbackDays: number;
  };
  action: {
    type: RuleActionType;
    /** Percent, only for budget actions */
    value?: number;
  };
  lastRunAt?: string;
  createdAt: string;
}

/** Workspace roles, from most to least privileged. */
export const ROLES = ['owner', 'media_buyer', 'client'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;

/** Workspace-wide settings, editable by the owner. */
export interface WorkspaceSettings {
  /** Largest daily budget (VND) per campaign for roles without budget:approve; null = unlimited */
  buyerDailyBudgetLimit: number | null;
  updatedAt?: string;
}

export interface Session {
  /** SHA-256 of the bearer token: a leaked database never reveals usable tokens */
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export type ActivityActor = 'user' | 'rule' | 'system';

export interface ActivityLog {
  id: string;
  actor: ActivityActor;
  actorName: string;
  /** Set when actor is a user */
  actorId?: string;
  message: string;
  campaignId?: string;
  createdAt: string;
}

/** An in-app notice for one user, e.g. an owner told that a media buyer changed a campaign. */
export interface Notification {
  id: string;
  recipientId: string;
  actorName: string;
  message: string;
  campaignId?: string;
  createdAt: string;
  readAt?: string;
}
