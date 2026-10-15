export type Platform = 'facebook' | 'tiktok' | 'google';
export type Objective = 'awareness' | 'traffic' | 'engagement' | 'leads' | 'app_promotion' | 'sales';
export type CampaignStatus = 'ACTIVE' | 'PAUSED';
export type RuleMetric = 'cpa' | 'roas' | 'spend' | 'ctr';
export type RuleOperator = 'gt' | 'lt';
export type RuleActionType = 'pause' | 'activate' | 'increase_budget' | 'decrease_budget';
export type Role = 'owner' | 'media_buyer' | 'client';
export type Permission =
  | 'report:view'
  | 'campaign:view'
  | 'campaign:manage'
  | 'rule:view'
  | 'rule:manage'
  | 'integration:view'
  | 'integration:manage'
  | 'activity:view'
  | 'budget:approve'
  | 'user:manage'
  | 'workspace:manage';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

/** The signed-in user; permissions come from the server so the role matrix lives in one place. */
export interface AuthUser extends User {
  permissions: Permission[];
  /** Max daily budget (VND) per campaign this user may set; null = no cap */
  dailyBudgetLimit: number | null;
}

export interface ProfileChanges {
  name?: string;
  email?: string;
  /** Required by the server only when the email changes */
  currentPassword?: string;
}

export interface WorkspaceSettings {
  /** Max daily budget (VND) per campaign for Media Buyers; null = unlimited */
  buyerDailyBudgetLimit: number | null;
  updatedAt?: string;
}

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

export interface Kpis {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
}

export interface Integration {
  platform: Platform;
  displayName: string;
  minDailyBudget: number;
  connected: boolean;
  accountId?: string;
  accountName?: string;
  connectedAt?: string;
  /** False while the server uses the simulator for this platform (no real API credentials). */
  live: boolean;
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

export interface MediaAsset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  sha256: string;
  metaHashes?: Record<string, string>;
  createdAt: string;
}

export interface Creative {
  headline: string;
  primaryText: string;
  landingUrl: string;
  imageId?: string;
  cta?: string;
}

export type CampaignDraftState =
  | 'DRAFT'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'NEEDS_RECONCILE'
  | 'NEEDS_REVIEW';

export interface AbVariant {
  key: string;
  name: string;
  value: Record<string, any>;
}

export interface AbPlan {
  enabled: boolean;
  variable: 'content' | 'audience' | 'placements';
  splitRatio?: number;
  variants: AbVariant[];
  metric?: 'cpa' | 'ctr' | 'roas';
  startDate?: string;
  endDate?: string;
}

export interface PlacementsConfig {
  mode: 'preset' | 'auto' | 'manual';
  list?: string[];
}

export interface DaypartingConfig {
  days: number[]; // 0: CN, 1: T2, ..., 6: T7
  from_hour: number;
  to_hour: number;
}

export interface AdvancedConfig {
  optimization_goal?: string;
  bid_strategy?: 'LOWEST_COST_WITHOUT_CAP' | 'COST_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'MINIMUM_ROAS';
  bid_amount?: number;
  billing_event?: string;
  destination_type?: string;
  attribution_window?: string;
  url_tags?: string;
  lead_form_id?: string;
  special_ad_categories?: string[];
  dayparting?: DaypartingConfig;
}

export interface ExtendedAudience extends Audience {
  detailedTargeting?: string[];
  advantageExpansion?: boolean;
  reachEstimate?: number;
}

export interface CampaignDraftPayload {
  name: string;
  objective: Objective;
  platforms: Platform[];
  totalDailyBudget: number;
  allocations: Array<{ platform: Platform; percentage?: number; percent?: number }>;
  creative: Creative;
  pages?: PageRef[];
  audience?: ExtendedAudience;
  schedule?: CampaignSchedule;
  specialCategory?: SpecialCategory;
  accountId?: string;
  acknowledgeNationwide?: boolean;

  // Expert Mode & A/B testing
  destination?: string;
  buying_type?: 'AUCTION' | 'RESERVED';
  setup_mode?: 'recommended' | 'manual';
  ab_plan?: AbPlan;
  placements?: PlacementsConfig;
  advanced?: AdvancedConfig;
  budget?: {
    mode?: 'daily' | 'lifetime' | 'until_paused';
    amount?: number | null;
    cbo?: boolean;
  };
}

export interface CheckLevelResult {
  level: 'CAMPAIGN' | 'AD_SET' | 'AD_CREATIVE' | 'AD';
  pageId?: string;
  status: 'PASSED' | 'FAILED';
  code?: string;
  message?: string;
}

export interface CampaignDraft {
  id: string;
  ownerId: string;
  revision: number;
  state: CampaignDraftState;
  step: number;
  payload: CampaignDraftPayload;
  check?: {
    revision: number;
    at: string;
    levels: CheckLevelResult[];
  };
  submission?: {
    idempotencyKey: string;
    tag: string;
    startedAt: string;
    results?: {
      campaignId?: string;
      platformIds?: Partial<Record<Platform, string>>;
      metaCampaignId?: string;
    };
    error?: {
      code?: string;
      message: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  platform: Platform;
  externalId: string;
  name: string;
  objective: Objective;
  platformObjective: string;
  status: CampaignStatus;
  dailyBudget: number;
  unifiedCampaignId?: string;
  /** Present for campaigns created through AdHub */
  creative?: Creative;
  /** Ad account the campaign runs in */
  accountId?: string;
  /** Set once the campaign was moved to another account: the campaign that took over */
  replacedBy?: string;
  pages?: PageRef[];
  audience?: Audience;
  schedule?: CampaignSchedule;
  specialCategory?: SpecialCategory;
  draftId?: string;
  meta?: CampaignMetaInfo;
  createdAt: string;
  connected: boolean;
  kpis: Kpis;
}

/** How well an ad account suits a campaign; computed by the server's advisor. */
export interface AccountFit {
  accountId: string;
  score: number;
  eligible: boolean;
  /** Days of the campaign's budget left before the spending limit; null = no limit */
  runwayDays: number | null;
  breakdown: { performance: number; runway: number; focus: number; maturity: number };
  pros: string[];
  cons: string[];
}

export interface AdAccountOption {
  id: string;
  name: string;
  platform: Platform;
  active: boolean;
  spendCap: number | null;
  amountSpent: number | null;
  /** The account the platform was connected with */
  primary: boolean;
  campaigns: number;
  activeCampaigns: number;
  kpis: Kpis;
  fit: AccountFit;
  current: boolean;
  recommended: boolean;
}

export interface DailyPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface CopyOptions {
  /** Absent = the advisor's best account on the target platform */
  accountId?: string;
  /** Absent = the campaign's own platform */
  platform?: Platform;
  /** Absent = the campaign's own ad copy */
  creative?: Creative;
  /** Take over from the original: the copy keeps it running and the original pauses */
  move?: boolean;
}

export interface CopyResult {
  campaign: Campaign;
  account: { id: string; name: string };
  moved: boolean;
}

export interface CampaignDetail {
  campaign: Campaign;
  previousKpis: Kpis;
  daily: DailyPoint[];
  advice: { accounts: AdAccountOption[]; recommendedId: string | null; lookbackDays: number };
  accountCounts: { platform: Platform; displayName: string; total: number; active: number }[];
  siblings: Pick<Campaign, 'id' | 'platform' | 'name' | 'status' | 'dailyBudget'>[];
}

export interface BulkStatusResult {
  updated: number;
  errors: { campaignId: string; message: string }[];
}

export interface BulkDeleteResult {
  deleted: number;
  errors: { campaignId: string; message: string }[];
}

export interface Notification {
  id: string;
  actorName: string;
  message: string;
  campaignId?: string;
  createdAt: string;
  readAt?: string;
}

export interface NotificationInbox {
  unread: number;
  items: Notification[];
}

export interface DashboardSummary {
  range: { from: string; to: string };
  totals: Kpis;
  byPlatform: {
    platform: Platform;
    displayName: string;
    activeCampaigns: number;
    totalCampaigns: number;
    kpis: Kpis;
  }[];
  dailySpend: ({ date: string } & Partial<Record<Platform, number>>)[];
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  platform: Platform | 'all';
  condition: { metric: RuleMetric; operator: RuleOperator; threshold: number; lookbackDays: number };
  action: { type: RuleActionType; value?: number };
  lastRunAt?: string;
  createdAt: string;
}

export type NewRule = Omit<Rule, 'id' | 'createdAt' | 'lastRunAt'>;

export interface RuleRunResult {
  ruleName: string;
  evaluated: number;
  actions: { campaignId: string; campaignName: string; description: string }[];
  errors: string[];
}

export interface CreateUnifiedCampaignInput {
  name: string;
  objective: Objective;
  totalDailyBudget: number;
  allocations: { platform: Platform; percent: number }[];
  creative: Creative;
}

export type PlatformPublishResult =
  | { platform: Platform; success: true; campaign: Campaign; account?: { id: string; name: string; reason: string } }
  | { platform: Platform; success: false; error: string };

export interface ActivityLog {
  id: string;
  actor: 'user' | 'rule' | 'system';
  actorName: string;
  actorId?: string;
  message: string;
  campaignId?: string;
  createdAt: string;
}
