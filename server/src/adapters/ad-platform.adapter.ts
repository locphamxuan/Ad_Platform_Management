import type { AdAccount, Campaign, CampaignStatus, Creative, MetricDaily, Objective, Platform } from '../domain/types.js';

export interface CreatePlatformCampaignInput {
  name: string;
  objective: Objective;
  dailyBudget: number;
  creative: Creative;
  /** Ad account to create in; absent = the configured default account */
  accountId?: string;
}

export interface CreatePlatformCampaignResult {
  externalId: string;
  platformObjective: string;
}

/** Real platform campaign ids are numeric; demo campaigns carry mock ids such as "tt-1a2b". */
export const isPlatformCampaignId = (externalId: string) => /^\d+$/.test(externalId);

/**
 * Port every ad platform must implement. Real Meta/TikTok/Google adapters
 * replace the mocks without touching services.
 */
export interface IAdPlatformAdapter {
  readonly platform: Platform;
  readonly displayName: string;
  /** True when calls reach the real platform API; false for the simulated adapter. */
  readonly live: boolean;
  /** Minimum daily budget accepted by the platform, in VND */
  readonly minDailyBudget: number;

  mapObjective(objective: Objective): string;
  authorize(): Promise<{ accountId: string; accountName: string }>;
  /** Every ad account the credentials can run campaigns in; always includes the authorised one. */
  listAdAccounts(): Promise<AdAccount[]>;
  createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult>;
  updateStatus(externalId: string, status: CampaignStatus): Promise<void>;
  updateBudget(externalId: string, dailyBudget: number): Promise<void>;
  /** Removes the campaign on the platform; demo campaigns that never existed there are skipped. */
  deleteCampaign(externalId: string): Promise<void>;
  fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily>;
}
