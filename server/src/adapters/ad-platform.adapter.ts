import type {
  AdAccount,
  Audience,
  Campaign,
  CampaignSchedule,
  CampaignStatus,
  CheckLevelResult,
  Creative,
  MetricDaily,
  Objective,
  PageRef,
  Platform,
  SpecialCategory,
} from '../domain/types.js';

export interface CreatePlatformCampaignInput {
  name: string;
  objective: Objective;
  dailyBudget: number;
  creative: Creative;
  /** Ad account to create in; absent = the configured default account */
  accountId?: string;
  pages?: PageRef[];
  audience?: Audience;
  schedule?: CampaignSchedule;
  specialCategory?: SpecialCategory;
  idempotencyTag?: string;
  image?: {
    id: string;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    metaHash?: string;
  };
}

export interface CreatePlatformCampaignResult {
  externalId: string;
  platformObjective: string;
  meta?: {
    adSetId?: string;
    ads: Array<{
      adId: string;
      pageId: string;
      creativeId?: string;
      review?: { status: string; reason?: string };
    }>;
  };
}

export interface LocationSearchResult {
  key: string;
  name: string;
  type: string;
}

export interface StatusFetchResult {
  status: string;
  effectiveStatus?: string;
  reviewStatus?: string;
  reviewReason?: string;
  deletedOnMeta?: boolean;
  dailyBudget?: number;
  schedule?: CampaignSchedule;
}

export interface AccountHealthResult {
  healthy: boolean;
  currency: string;
  active: boolean;
  spendCapReached: boolean;
  balanceIssue: boolean;
  reasons: string[];
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
  /** When true, campaigns cannot be directly activated in AdHub; user must activate in platform UI */
  readonly activationOnPlatformOnly?: boolean;

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

  listPages?(): Promise<PageRef[]>;
  searchLocations?(query: string): Promise<LocationSearchResult[]>;
  validateCampaign?(input: CreatePlatformCampaignInput): Promise<CheckLevelResult[]>;
  previewAd?(input: { pageId: string; creative: Creative; adFormat?: string }): Promise<{ iframeHtml?: string; fallback?: boolean }>;
  findByTag?(tag: string, accountId?: string): Promise<{ campaignId: string; status: string; adCount: number } | null>;
  readBack?(campaignId: string): Promise<{ campaignId: string; status: string; pages: string[]; schedule?: CampaignSchedule; adCount: number } | null>;
  fetchStatuses?(campaignIds: string[]): Promise<Record<string, StatusFetchResult>>;
  accountHealth?(): Promise<AccountHealthResult>;
}
