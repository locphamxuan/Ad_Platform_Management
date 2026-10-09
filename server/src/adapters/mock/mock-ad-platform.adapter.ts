import { randomUUID } from 'node:crypto';
import type { Campaign, CampaignStatus, MetricDaily, Objective, Platform } from '../../domain/types.js';
import type {
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
} from '../ad-platform.adapter.js';

export interface MockPlatformProfile {
  platform: Platform;
  displayName: string;
  externalIdPrefix: string;
  minDailyBudget: number;
  objectiveMap: Record<Objective, string>;
  /** Average performance used to simulate insights */
  cpm: number;
  ctr: number;
  conversionRate: number;
  avgOrderValue: number;
}

/** Simulates a platform API so the product works end-to-end before API approval. */
export class MockAdPlatformAdapter implements IAdPlatformAdapter {
  readonly platform: Platform;
  readonly displayName: string;
  readonly minDailyBudget: number;

  constructor(
    private readonly profile: MockPlatformProfile,
    private readonly random: () => number = Math.random,
  ) {
    this.platform = profile.platform;
    this.displayName = profile.displayName;
    this.minDailyBudget = profile.minDailyBudget;
  }

  mapObjective(objective: Objective): string {
    return this.profile.objectiveMap[objective];
  }

  async authorize() {
    return {
      accountId: `${this.profile.externalIdPrefix}-act-${randomUUID().slice(0, 8)}`,
      accountName: `${this.displayName} Ad Account`,
    };
  }

  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    return {
      externalId: `${this.profile.externalIdPrefix}-${randomUUID().slice(0, 12)}`,
      platformObjective: this.mapObjective(input.objective),
    };
  }

  async updateStatus(_externalId: string, _status: CampaignStatus): Promise<void> {}

  async updateBudget(_externalId: string, _dailyBudget: number): Promise<void> {}

  async fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily> {
    return simulateDailyMetrics(this.profile, campaign.id, campaign.dailyBudget, date, this.random);
  }
}

/** Shared by the adapter and the seed so generated data stays consistent. */
export function simulateDailyMetrics(
  profile: MockPlatformProfile,
  campaignId: string,
  dailyBudget: number,
  date: string,
  random: () => number,
): MetricDaily {
  const jitter = (spread: number) => 1 + (random() * 2 - 1) * spread;
  const spend = Math.round(dailyBudget * (0.75 + random() * 0.25));
  const impressions = Math.round((spend / profile.cpm) * 1000 * jitter(0.2));
  const clicks = Math.round(impressions * profile.ctr * jitter(0.35));
  const conversions = Math.round(clicks * profile.conversionRate * jitter(0.6));
  const revenue = Math.round(conversions * profile.avgOrderValue * jitter(0.2));
  return { campaignId, date, spend, impressions, clicks, conversions, revenue };
}
