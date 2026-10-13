export type Platform = 'facebook' | 'tiktok' | 'google';
export type Objective = 'awareness' | 'traffic' | 'leads' | 'sales';
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
  createdAt: string;
  connected: boolean;
  kpis: Kpis;
}

export interface Creative {
  headline: string;
  primaryText: string;
  landingUrl: string;
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
