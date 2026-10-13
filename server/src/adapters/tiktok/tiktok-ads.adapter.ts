import type { Campaign, CampaignStatus, MetricDaily, Objective } from '../../domain/types.js';
import { AppError } from '../../domain/errors.js';
import type { TikTokConfig } from '../../config/env.js';
import type {
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
} from '../ad-platform.adapter.js';
import { isPlatformCampaignId } from '../ad-platform.adapter.js';

const OBJECTIVE_MAP: Record<Objective, string> = {
  awareness: 'REACH',
  traffic: 'TRAFFIC',
  leads: 'LEAD_GENERATION',
  // PRODUCT_SALES needs a TikTok Shop or catalog; website purchases use WEB_CONVERSIONS.
  sales: 'WEB_CONVERSIONS',
};

/** TikTok answers HTTP 200 with a non-zero `code` on failure. */
interface TikTokEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

/** Codes TikTok uses for missing, expired or revoked access tokens. */
const TOKEN_ERROR_CODES = new Set([40001, 40100, 40104, 40105]);

export class TikTokApiError extends AppError {
  constructor(message: string, public readonly tiktokCode?: number) {
    super('TIKTOK_API_ERROR', message, 502);
  }
}

type Params = Record<string, string | number | object | undefined>;

interface ReportRow {
  metrics?: Record<string, string | undefined>;
}

/**
 * Real TikTok ads through the TikTok API for Business (Marketing API v1.3).
 * AdHub owns the campaign (objective, daily budget, on/off). TikTok ads need a video and an
 * identity, so the ad group and ad are finished in TikTok Ads Manager after AdHub creates the campaign.
 */
export class TikTokAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'tiktok' as const;
  readonly displayName = 'TikTok Ads';
  readonly live = true;
  readonly minDailyBudget = 50_000;

  constructor(
    private readonly config: TikTokConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  mapObjective(objective: Objective): string {
    return OBJECTIVE_MAP[objective];
  }

  async authorize() {
    const { list } = await this.get<{ list: { name: string; currency: string; status: string }[] }>('advertiser/info/', {
      advertiser_ids: [this.config.advertiserId],
      fields: ['name', 'currency', 'status'],
    });
    const advertiser = list[0];
    if (!advertiser) throw new AppError('TIKTOK_ADVERTISER', 'Token không có quyền với TIKTOK_ADVERTISER_ID này');
    if (advertiser.currency !== 'VND') {
      throw new AppError('TIKTOK_CURRENCY', `Tài khoản TikTok dùng ${advertiser.currency}; AdHub chỉ hỗ trợ VND`);
    }
    if (advertiser.status !== 'STATUS_ENABLE') {
      throw new AppError('TIKTOK_ACCOUNT_INACTIVE', `Tài khoản TikTok "${advertiser.name}" đang không hoạt động (${advertiser.status})`);
    }
    return { accountId: this.config.advertiserId, accountName: advertiser.name };
  }

  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    const { campaign_id } = await this.post<{ campaign_id: string }>('campaign/create/', {
      advertiser_id: this.config.advertiserId,
      campaign_name: input.name,
      objective_type: this.mapObjective(input.objective),
      budget_mode: 'BUDGET_MODE_DAY',
      budget: input.dailyBudget,
      operation_status: 'DISABLE',
    });
    return { externalId: campaign_id, platformObjective: this.mapObjective(input.objective) };
  }

  async updateStatus(externalId: string, status: CampaignStatus): Promise<void> {
    await this.post('campaign/status/update/', {
      advertiser_id: this.config.advertiserId,
      campaign_ids: [assertTikTokId(externalId)],
      operation_status: status === 'ACTIVE' ? 'ENABLE' : 'DISABLE',
    });
  }

  async updateBudget(externalId: string, dailyBudget: number): Promise<void> {
    await this.post('campaign/update/', {
      advertiser_id: this.config.advertiserId,
      campaign_id: assertTikTokId(externalId),
      budget: dailyBudget,
    });
  }

  async deleteCampaign(externalId: string): Promise<void> {
    if (!isPlatformCampaignId(externalId)) return;
    await this.post('campaign/status/update/', {
      advertiser_id: this.config.advertiserId,
      campaign_ids: [externalId],
      operation_status: 'DELETE',
    });
  }

  async fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily> {
    const { list } = await this.get<{ list: ReportRow[] }>('report/integrated/get/', {
      advertiser_id: this.config.advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id'],
      metrics: ['spend', 'impressions', 'clicks', 'conversion', 'complete_payment_roas'],
      start_date: date,
      end_date: date,
      filtering: [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([assertTikTokId(campaign.externalId)]) }],
    });
    return toTikTokDailyMetrics(campaign, date, list[0]);
  }

  private get<T>(path: string, params: Params): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      // Arrays and objects travel as JSON strings in TikTok query parameters.
      if (value !== undefined) query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    return this.request<T>(`${path}?${query}`, { method: 'GET' });
  }

  private post<T>(path: string, body: Params): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.http(`${this.config.apiBase}/${path}`, {
      ...init,
      headers: { 'Access-Token': this.config.accessToken, 'Content-Type': 'application/json' },
    });
    const json = (await response.json().catch(() => ({}))) as Partial<TikTokEnvelope<T>>;
    if (!response.ok || json.code !== 0) {
      const code = json.code;
      const detail = json.message || response.statusText || 'TikTok API request failed';
      throw new TikTokApiError(
        code !== undefined && TOKEN_ERROR_CODES.has(code)
          ? `Token TikTok hết hạn hoặc không hợp lệ, hãy tạo token mới trong server/.env (${detail})`
          : `TikTok: ${detail}`,
        code,
      );
    }
    return json.data as T;
  }
}

/** Demo campaigns have mock ids like "tt-1a2b"; TikTok ids are numeric. */
function assertTikTokId(externalId: string): string {
  if (!/^\d+$/.test(externalId)) {
    throw new AppError('NOT_ON_TIKTOK', 'Chiến dịch demo này không tồn tại trên TikTok, chỉ chiến dịch tạo mới mới chạy thật');
  }
  return externalId;
}

/** No row means no delivery that day; conversions and revenue only count for goal-based objectives. */
export function toTikTokDailyMetrics(campaign: Campaign, date: string, row: ReportRow = {}): MetricDaily {
  const m = row.metrics ?? {};
  const spend = Number(m.spend ?? 0);
  const countsConversions = campaign.objective === 'leads' || campaign.objective === 'sales';
  return {
    campaignId: campaign.id,
    date,
    spend: Math.round(spend),
    impressions: Number(m.impressions ?? 0),
    clicks: Number(m.clicks ?? 0),
    conversions: countsConversions ? Number(m.conversion ?? 0) : 0,
    revenue: campaign.objective === 'sales' ? Math.round(spend * Number(m.complete_payment_roas ?? 0)) : 0,
  };
}
