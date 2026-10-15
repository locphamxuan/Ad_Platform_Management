import { randomUUID } from 'node:crypto';
import type {
  AdAccount,
  Campaign,
  CampaignSchedule,
  CampaignStatus,
  CheckLevelResult,
  Creative,
  MetricDaily,
  Objective,
  PageRef,
  Platform,
} from '../../domain/types.js';
import type {
  AccountHealthResult,
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
  LocationSearchResult,
  StatusFetchResult,
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

const MOCK_PROVINCES: LocationSearchResult[] = [
  { key: '3824', name: 'Hà Nội', type: 'region' },
  { key: '3825', name: 'Hồ Chí Minh', type: 'region' },
  { key: '3826', name: 'Đà Nẵng', type: 'city' },
  { key: '3827', name: 'Cần Thơ', type: 'city' },
  { key: '3828', name: 'Hải Phòng', type: 'city' },
  { key: '3829', name: 'Bình Dương', type: 'region' },
  { key: '3830', name: 'Đồng Nai', type: 'region' },
  { key: '3831', name: 'Khánh Hòa', type: 'region' },
];

/** Simulates a platform API so the product works end-to-end before API approval. */
export class MockAdPlatformAdapter implements IAdPlatformAdapter {
  readonly platform: Platform;
  readonly displayName: string;
  readonly live = false;
  readonly minDailyBudget: number;
  readonly activationOnPlatformOnly: boolean;

  constructor(
    private readonly profile: MockPlatformProfile,
    private readonly random: () => number = Math.random,
  ) {
    this.platform = profile.platform;
    this.displayName = profile.displayName;
    this.minDailyBudget = profile.minDailyBudget;
    this.activationOnPlatformOnly = profile.platform === 'facebook';
  }

  mapObjective(objective: Objective): string {
    return this.profile.objectiveMap[objective];
  }

  async authorize() {
    const [main] = mockAdAccounts(this.profile);
    return { accountId: main.id, accountName: main.name };
  }

  async listAdAccounts(): Promise<AdAccount[]> {
    return mockAdAccounts(this.profile);
  }

  async listPages(): Promise<PageRef[]> {
    return [
      { id: '1371022039427716', name: 'Bosa Group', hasInstagram: true, isAdvertisingAllowed: true },
      { id: 'mock_page_2', name: 'Bosa Group Thương Mại & Dịch Vụ', hasInstagram: false, isAdvertisingAllowed: true },
      { id: 'mock_page_blocked', name: 'Trang Không Hợp Lệ (Demo Lỗi)', hasInstagram: false, isAdvertisingAllowed: false },
    ];
  }

  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_PROVINCES;
    return MOCK_PROVINCES.filter((p) => p.name.toLowerCase().includes(q));
  }

  async accountHealth(): Promise<AccountHealthResult> {
    return {
      healthy: true,
      currency: 'VND',
      active: true,
      spendCapReached: false,
      balanceIssue: false,
      reasons: [],
    };
  }

  async validateCampaign(input: CreatePlatformCampaignInput): Promise<CheckLevelResult[]> {
    const results: CheckLevelResult[] = [];

    // Campaign level
    results.push({ level: 'CAMPAIGN', status: 'PASSED' });

    // Ad Set level
    if (input.audience && input.audience.ageMin > input.audience.ageMax) {
      results.push({
        level: 'AD_SET',
        status: 'FAILED',
        code: 'INVALID_AGE_RANGE',
        message: 'Độ tuổi tối thiểu lớn hơn độ tuổi tối đa',
      });
    } else {
      results.push({ level: 'AD_SET', status: 'PASSED' });
    }

    // Creative & Ad levels per page
    const pages = input.pages && input.pages.length > 0
      ? input.pages
      : [{ id: 'mock_page_1', name: 'AdHub Official Fanpage' }];

    for (const page of pages) {
      if (page.id === 'mock_page_blocked' || page.isAdvertisingAllowed === false) {
        results.push({
          level: 'AD_CREATIVE',
          pageId: page.id,
          status: 'FAILED',
          code: 'META_PAGE_RESTRICTED',
          message: `[${page.name}] Trang này bị hạn chế quảng cáo hoặc chưa được xuất bản.`,
        });
        results.push({
          level: 'AD',
          pageId: page.id,
          status: 'FAILED',
          code: 'META_PAGE_RESTRICTED',
          message: `[${page.name}] Trang không đủ điều kiện phân phối quảng cáo.`,
        });
      } else {
        results.push({ level: 'AD_CREATIVE', pageId: page.id, status: 'PASSED' });
        results.push({ level: 'AD', pageId: page.id, status: 'PASSED' });
      }
    }

    return results;
  }

  async previewAd(_input: { pageId: string; creative: Creative; adFormat?: string }): Promise<{ iframeHtml?: string; fallback?: boolean }> {
    return { fallback: true };
  }

  async findByTag(tag: string): Promise<{ campaignId: string; status: string; adCount: number } | null> {
    return { campaignId: `${this.profile.externalIdPrefix}-${tag}`, status: 'PAUSED', adCount: 1 };
  }

  async readBack(campaignId: string): Promise<{ campaignId: string; status: string; pages: string[]; schedule?: CampaignSchedule; adCount: number } | null> {
    return {
      campaignId,
      status: 'PAUSED',
      pages: ['mock_page_1'],
      adCount: 1,
    };
  }

  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    const externalId = `${this.profile.externalIdPrefix}-${randomUUID().slice(0, 12)}`;
    const pages = input.pages && input.pages.length > 0
      ? input.pages
      : [{ id: 'mock_page_1', name: 'Default Fanpage' }];

    return {
      externalId,
      platformObjective: this.mapObjective(input.objective),
      meta: {
        adSetId: `mock-adset-${randomUUID().slice(0, 8)}`,
        ads: pages.map((p) => ({
          adId: `mock-ad-${randomUUID().slice(0, 8)}`,
          pageId: p.id,
          creativeId: `mock-creative-${randomUUID().slice(0, 8)}`,
          review: { status: 'PENDING' },
        })),
      },
    };
  }

  async updateStatus(_externalId: string, _status: CampaignStatus): Promise<void> {}

  async updateBudget(_externalId: string, _dailyBudget: number): Promise<void> {}

  async deleteCampaign(_externalId: string): Promise<void> {}

  async fetchStatuses(campaignIds: string[]): Promise<Record<string, StatusFetchResult>> {
    const map: Record<string, StatusFetchResult> = {};
    for (const id of campaignIds) {
      map[id] = {
        status: 'PAUSED',
        effectiveStatus: 'PAUSED',
        reviewStatus: 'APPROVED',
      };
    }
    return map;
  }

  async fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily> {
    return simulateDailyMetrics(this.profile, campaign.id, campaign.dailyBudget, date, this.random);
  }
}

/**
 * A typical setup: a main account, a second one used to scale, and a nearly exhausted test account
 * (so the advisor has a spending limit to steer around). Stable ids, shared with the seed.
 */
export function mockAdAccounts(profile: MockPlatformProfile): AdAccount[] {
  const id = (suffix: string) => `${profile.externalIdPrefix}-act-${suffix}`;
  return [
    { id: id('demo'), name: `${profile.displayName} · Tài khoản chính`, active: true, spendCap: null, amountSpent: null },
    { id: id('scale'), name: `${profile.displayName} · Tài khoản mở rộng`, active: true, spendCap: 300_000_000, amountSpent: 84_000_000 },
    { id: id('test'), name: `${profile.displayName} · Tài khoản thử nghiệm`, active: true, spendCap: 40_000_000, amountSpent: 37_500_000 },
  ];
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
