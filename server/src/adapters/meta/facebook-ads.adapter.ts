import type { Campaign, CampaignStatus, MetricDaily, Objective } from '../../domain/types.js';
import { AppError } from '../../domain/errors.js';
import type { MetaConfig } from '../../config/env.js';
import type {
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
} from '../ad-platform.adapter.js';
import { MetaGraphClient } from './meta-graph.client.js';

const OBJECTIVE_MAP: Record<Objective, string> = {
  awareness: 'OUTCOME_AWARENESS',
  traffic: 'OUTCOME_TRAFFIC',
  leads: 'OUTCOME_LEADS',
  sales: 'OUTCOME_SALES',
};

/** How each objective is optimised at ad set level; leads and sales track a website Pixel event. */
const AD_SET_GOALS: Record<Objective, { optimizationGoal: string; pixelEvent?: string }> = {
  awareness: { optimizationGoal: 'REACH' },
  traffic: { optimizationGoal: 'LINK_CLICKS' },
  leads: { optimizationGoal: 'OFFSITE_CONVERSIONS', pixelEvent: 'LEAD' },
  sales: { optimizationGoal: 'OFFSITE_CONVERSIONS', pixelEvent: 'PURCHASE' },
};

/** Insight action types counted as a conversion, most specific first. */
const CONVERSION_ACTIONS: Partial<Record<Objective, string[]>> = {
  leads: ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'],
  sales: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
};

/** Ad account statuses: 1 = active; anything else cannot deliver ads. */
const ACTIVE_ACCOUNT_STATUS = 1;

interface InsightAction {
  action_type: string;
  value: string;
}

interface InsightRow {
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: InsightAction[];
  action_values?: InsightAction[];
}

/**
 * Real Facebook/Instagram ads through the Meta Marketing API.
 * One AdHub campaign = one Meta campaign (holding the daily budget) with one ad set and one ad,
 * so status and budget changes only ever touch the campaign object.
 */
export class FacebookAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'facebook' as const;
  readonly displayName = 'Facebook Ads';
  /** Meta rejects very small daily budgets; the exact floor depends on the account. */
  readonly minDailyBudget = 25_000;

  private readonly graph: MetaGraphClient;

  constructor(
    private readonly config: MetaConfig,
    http: typeof fetch = fetch,
  ) {
    this.graph = new MetaGraphClient(config, http);
  }

  mapObjective(objective: Objective): string {
    return OBJECTIVE_MAP[objective];
  }

  async authorize() {
    const account = await this.graph.get<{ name: string; currency: string; account_status: number }>(
      this.config.adAccountId,
      { fields: 'name,currency,account_status' },
    );
    if (account.currency !== 'VND') {
      throw new AppError('META_CURRENCY', `Tài khoản quảng cáo dùng ${account.currency}; AdHub chỉ hỗ trợ VND`);
    }
    if (account.account_status !== ACTIVE_ACCOUNT_STATUS) {
      throw new AppError('META_ACCOUNT_INACTIVE', `Tài khoản quảng cáo "${account.name}" đang không hoạt động trên Meta`);
    }
    return { accountId: this.config.adAccountId, accountName: account.name };
  }

  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    const goal = AD_SET_GOALS[input.objective];
    if (goal.pixelEvent && !this.config.pixelId) {
      throw new AppError('META_PIXEL_REQUIRED', 'Mục tiêu này cần META_PIXEL_ID trong server/.env');
    }

    const account = this.config.adAccountId;
    // VND has no minor unit, so Meta takes budgets in whole dong.
    const campaign = await this.graph.post<{ id: string }>(`${account}/campaigns`, {
      name: input.name,
      objective: this.mapObjective(input.objective),
      status: 'PAUSED',
      buying_type: 'AUCTION',
      special_ad_categories: [],
      daily_budget: input.dailyBudget,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    });

    try {
      // Children start ACTIVE: the PAUSED campaign alone decides whether anything delivers.
      const adSet = await this.graph.post<{ id: string }>(`${account}/adsets`, {
        name: `${input.name} - Nhóm quảng cáo`,
        campaign_id: campaign.id,
        status: 'ACTIVE',
        billing_event: 'IMPRESSIONS',
        optimization_goal: goal.optimizationGoal,
        targeting: {
          geo_locations: { countries: ['VN'] },
          age_min: 18,
          targeting_automation: { advantage_audience: 0 },
        },
        promoted_object: goal.pixelEvent
          ? { pixel_id: this.config.pixelId, custom_event_type: goal.pixelEvent }
          : undefined,
      });

      const creative = await this.graph.post<{ id: string }>(`${account}/adcreatives`, {
        name: `${input.name} - Mẫu quảng cáo`,
        object_story_spec: {
          page_id: this.config.pageId,
          link_data: {
            link: input.creative.landingUrl,
            message: input.creative.primaryText,
            name: input.creative.headline,
            call_to_action: { type: 'LEARN_MORE', value: { link: input.creative.landingUrl } },
          },
        },
      });

      await this.graph.post(`${account}/ads`, {
        name: `${input.name} - Quảng cáo`,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: 'ACTIVE',
      });
    } catch (error) {
      // Don't leave a half-built campaign behind in Ads Manager.
      await this.graph.delete(campaign.id).catch(() => undefined);
      throw error;
    }

    return { externalId: campaign.id, platformObjective: this.mapObjective(input.objective) };
  }

  async updateStatus(externalId: string, status: CampaignStatus): Promise<void> {
    await this.graph.post(assertMetaId(externalId), { status });
  }

  async updateBudget(externalId: string, dailyBudget: number): Promise<void> {
    await this.graph.post(assertMetaId(externalId), { daily_budget: dailyBudget });
  }

  async fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily> {
    const { data } = await this.graph.get<{ data: InsightRow[] }>(`${assertMetaId(campaign.externalId)}/insights`, {
      fields: 'spend,impressions,inline_link_clicks,actions,action_values',
      time_range: { since: date, until: date },
    });
    return toDailyMetrics(campaign, date, data[0]);
  }
}

/** Campaigns seeded by the demo have mock ids like "fb-1a2b"; Meta ids are numeric. */
function assertMetaId(externalId: string): string {
  if (!/^\d+$/.test(externalId)) {
    throw new AppError('NOT_ON_META', 'Chiến dịch demo này không tồn tại trên Meta, chỉ chiến dịch tạo mới mới chạy thật');
  }
  return externalId;
}

/** No row means no delivery that day. */
export function toDailyMetrics(campaign: Campaign, date: string, row: InsightRow = {}): MetricDaily {
  const types = CONVERSION_ACTIONS[campaign.objective] ?? [];
  const pick = (list: InsightAction[] = []) => {
    const type = types.find((t) => list.some((a) => a.action_type === t));
    return Number(list.find((a) => a.action_type === type)?.value ?? 0);
  };
  return {
    campaignId: campaign.id,
    date,
    spend: Math.round(Number(row.spend ?? 0)),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.inline_link_clicks ?? 0),
    conversions: pick(row.actions),
    revenue: Math.round(pick(row.action_values)),
  };
}
