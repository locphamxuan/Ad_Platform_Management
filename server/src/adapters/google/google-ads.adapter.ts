import type { Campaign, CampaignStatus, MetricDaily, Objective } from '../../domain/types.js';
import { AppError } from '../../domain/errors.js';
import type { GoogleAdsConfig } from '../../config/env.js';
import type {
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
} from '../ad-platform.adapter.js';
import { isPlatformCampaignId } from '../ad-platform.adapter.js';

/** Channel and bidding per objective. Performance Max needs asset groups, so sales use Search too. */
const CAMPAIGN_SETUP: Record<Objective, { channel: 'SEARCH' | 'DISPLAY'; bidding: Record<string, object> }> = {
  awareness: { channel: 'DISPLAY', bidding: { manualCpc: {} } },
  traffic: { channel: 'SEARCH', bidding: { targetSpend: {} } },
  leads: { channel: 'SEARCH', bidding: { maximizeConversions: {} } },
  sales: { channel: 'SEARCH', bidding: { maximizeConversions: {} } },
};

const MICROS = 1_000_000;

export class GoogleAdsApiError extends AppError {
  constructor(message: string) {
    super('GOOGLE_ADS_API_ERROR', message, 502);
  }
}

interface GoogleErrorBody {
  error?: {
    message?: string;
    status?: string;
    details?: { errors?: { message?: string }[] }[];
  };
}

interface MetricsRow {
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
  };
}

/**
 * Real Google Ads through the Google Ads API (REST). AdHub owns the campaign and its budget;
 * keywords, ad groups and ads are added in Google Ads before the campaign can serve.
 */
export class GoogleAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'google' as const;
  readonly displayName = 'Google Ads';
  readonly live = true;
  readonly minDailyBudget = 20_000;

  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: GoogleAdsConfig,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  mapObjective(objective: Objective): string {
    return CAMPAIGN_SETUP[objective].channel;
  }

  async authorize() {
    const [row] = await this.search<{ customer?: { descriptiveName?: string; currencyCode?: string; status?: string } }>(
      'SELECT customer.descriptive_name, customer.currency_code, customer.status FROM customer LIMIT 1',
    );
    const customer = row?.customer ?? {};
    const name = customer.descriptiveName || this.config.customerId;
    if (customer.currencyCode !== 'VND') {
      throw new AppError('GOOGLE_CURRENCY', `Tài khoản Google Ads dùng ${customer.currencyCode}; AdHub chỉ hỗ trợ VND`);
    }
    if (customer.status !== 'ENABLED') {
      throw new AppError('GOOGLE_ACCOUNT_INACTIVE', `Tài khoản Google Ads "${name}" đang không hoạt động (${customer.status})`);
    }
    return { accountId: this.config.customerId, accountName: name };
  }

  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    const setup = CAMPAIGN_SETUP[input.objective];
    const budget = await this.mutate('campaignBudgets', {
      create: {
        name: `${input.name} - Ngân sách ${Date.now()}`,
        amountMicros: String(input.dailyBudget * MICROS),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    });

    try {
      const campaign = await this.mutate('campaigns', {
        create: {
          name: input.name,
          status: 'PAUSED',
          advertisingChannelType: setup.channel,
          campaignBudget: budget,
          ...setup.bidding,
          ...(setup.channel === 'SEARCH' && {
            networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false },
          }),
          containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      });
      return { externalId: campaign.split('/').pop()!, platformObjective: setup.channel };
    } catch (error) {
      // Don't leave an orphan budget behind in the account.
      await this.mutate('campaignBudgets', { remove: budget }).catch(() => undefined);
      throw error;
    }
  }

  async updateStatus(externalId: string, status: CampaignStatus): Promise<void> {
    await this.mutate('campaigns', {
      update: { resourceName: this.campaignResource(externalId), status: status === 'ACTIVE' ? 'ENABLED' : 'PAUSED' },
      updateMask: 'status',
    });
  }

  async updateBudget(externalId: string, dailyBudget: number): Promise<void> {
    const [row] = await this.search<{ campaign?: { campaignBudget?: string } }>(
      `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${assertGoogleId(externalId)}`,
    );
    const budget = row?.campaign?.campaignBudget;
    if (!budget) throw new AppError('GOOGLE_NO_BUDGET', `Không tìm thấy ngân sách của chiến dịch ${externalId} trên Google Ads`);
    await this.mutate('campaignBudgets', {
      update: { resourceName: budget, amountMicros: String(dailyBudget * MICROS) },
      updateMask: 'amount_micros',
    });
  }

  async deleteCampaign(externalId: string): Promise<void> {
    if (isPlatformCampaignId(externalId)) await this.mutate('campaigns', { remove: this.campaignResource(externalId) });
  }

  async fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('INVALID_DATE', `Ngày không hợp lệ: ${date}`);
    const [row] = await this.search<MetricsRow>(
      'SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value ' +
        `FROM campaign WHERE campaign.id = ${assertGoogleId(campaign.externalId)} AND segments.date = '${date}'`,
    );
    return toGoogleDailyMetrics(campaign, date, row);
  }

  private campaignResource(externalId: string) {
    return `customers/${this.config.customerId}/campaigns/${assertGoogleId(externalId)}`;
  }

  private async search<T>(query: string): Promise<T[]> {
    const { results = [] } = await this.call<{ results?: T[] }>('googleAds:search', { query });
    return results;
  }

  /** One operation on one resource type; returns the resource name Google assigned. */
  private async mutate(resource: string, operation: object): Promise<string> {
    const { results = [] } = await this.call<{ results?: { resourceName: string }[] }>(`${resource}:mutate`, {
      operations: [operation],
    });
    return results[0]?.resourceName ?? '';
  }

  private async call<T>(method: string, body: object): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.token()}`,
      'developer-token': this.config.developerToken,
      'Content-Type': 'application/json',
    };
    if (this.config.loginCustomerId) headers['login-customer-id'] = this.config.loginCustomerId;
    const url = `https://googleads.googleapis.com/${this.config.apiVersion}/customers/${this.config.customerId}/${method}`;
    const response = await this.http(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => ({}))) as GoogleErrorBody & T;
    if (!response.ok || json.error) {
      const detail = json.error?.details?.[0]?.errors?.[0]?.message ?? json.error?.message ?? response.statusText;
      throw new GoogleAdsApiError(
        response.status === 401
          ? `Google Ads từ chối xác thực, kiểm tra refresh token trong server/.env (${detail})`
          : `Google Ads: ${detail}`,
      );
    }
    return json;
  }

  /** Access tokens last about an hour; refresh one minute early. */
  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now()) return this.accessToken.value;
    const response = await this.http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
      error?: string;
    };
    if (!response.ok || !json.access_token) {
      throw new GoogleAdsApiError(
        `Không lấy được access token Google, kiểm tra GOOGLE_ADS_CLIENT_ID/SECRET/REFRESH_TOKEN (${json.error_description ?? json.error ?? response.statusText})`,
      );
    }
    this.accessToken = { value: json.access_token, expiresAt: this.now() + ((json.expires_in ?? 3600) - 60) * 1000 };
    return json.access_token;
  }
}

/** Demo campaigns have mock ids like "gg-1a2b"; Google campaign ids are numeric. */
function assertGoogleId(externalId: string): string {
  if (!/^\d+$/.test(externalId)) {
    throw new AppError('NOT_ON_GOOGLE', 'Chiến dịch demo này không tồn tại trên Google Ads, chỉ chiến dịch tạo mới mới chạy thật');
  }
  return externalId;
}

/** No row means no delivery that day. */
export function toGoogleDailyMetrics(campaign: Campaign, date: string, row: MetricsRow = {}): MetricDaily {
  const m = row.metrics ?? {};
  const countsConversions = campaign.objective === 'leads' || campaign.objective === 'sales';
  return {
    campaignId: campaign.id,
    date,
    spend: Math.round(Number(m.costMicros ?? 0) / MICROS),
    impressions: Number(m.impressions ?? 0),
    clicks: Number(m.clicks ?? 0),
    conversions: countsConversions ? Math.round(Number(m.conversions ?? 0)) : 0,
    revenue: campaign.objective === 'sales' ? Math.round(Number(m.conversionsValue ?? 0)) : 0,
  };
}
