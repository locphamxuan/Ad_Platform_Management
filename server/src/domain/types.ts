export const PLATFORMS = ['facebook', 'tiktok', 'google'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const OBJECTIVES = ['awareness', 'traffic', 'leads', 'sales'] as const;
export type Objective = (typeof OBJECTIVES)[number];

export type CampaignStatus = 'ACTIVE' | 'PAUSED';

export interface Creative {
  headline: string;
  primaryText: string;
  landingUrl: string;
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
  createdAt: string;
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
