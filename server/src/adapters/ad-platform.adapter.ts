import type { Campaign, CampaignStatus, Creative, MetricDaily, Objective, Platform } from '../domain/types.js';

export interface CreatePlatformCampaignInput {
  name: string;
  objective: Objective;
  dailyBudget: number;
  creative: Creative;
}

export interface CreatePlatformCampaignResult {
  externalId: string;
  platformObjective: string;
}

/**
 * Port every ad platform must implement. Real Meta/TikTok/Google adapters
 * replace the mocks without touching services.
 */
export interface IAdPlatformAdapter {
  readonly platform: Platform;
  readonly displayName: string;
  /** Minimum daily budget accepted by the platform, in VND */
  readonly minDailyBudget: number;

  mapObjective(objective: Objective): string;
  authorize(): Promise<{ accountId: string; accountName: string }>;
  createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult>;
  updateStatus(externalId: string, status: CampaignStatus): Promise<void>;
  updateBudget(externalId: string, dailyBudget: number): Promise<void>;
  fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily>;
}
