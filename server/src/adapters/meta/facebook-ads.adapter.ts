import type { AdAccount, Campaign, CampaignStatus, MetricDaily, Objective } from '../../domain/types.js';
import { AppError } from '../../domain/errors.js';
import type { MetaConfig } from '../../config/env.js';
import type {
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
} from '../ad-platform.adapter.js';
import { isPlatformCampaignId } from '../ad-platform.adapter.js';
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
 * so status and budget changes only ever touch the campaign object. The ad is a Page post that is
 * on the Page's timeline only while the campaign runs: published when first switched on, hidden when paused.
 */
export class FacebookAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'facebook' as const;
  readonly displayName = 'Facebook Ads';
  readonly live = true;
  /** Meta rejects very small daily budgets; the exact floor depends on the account. */
  readonly minDailyBudget = 25_000;

  private readonly graph: MetaGraphClient;

  constructor(
    private readonly config: MetaConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.graph = new MetaGraphClient(config, http);
  }

  /** Page posts must be written with the Page's own token, which the user token can hand out. */
  private async pageGraph(): Promise<MetaGraphClient> {
    const page = await this.graph.get<{ access_token?: string }>(this.config.pageId, { fields: 'access_token' });
    if (!page.access_token) {
      throw new AppError(
        'META_PAGE_TOKEN',
        'Token Meta không quản lý được Page, cần quyền pages_manage_posts và vai trò quản trị trên Page',
      );
    }
    return new MetaGraphClient({ ...this.config, accessToken: page.access_token }, this.http);
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

  /**
   * The VND ad accounts the token's user can advertise from. The page and pixel belong to the same
   * business, so any of them can run AdHub campaigns; other currencies are left out.
   */
  async listAdAccounts(): Promise<AdAccount[]> {
    const { data } = await this.graph.get<{ data: MetaAdAccountRow[] }>('me/adaccounts', {
      fields: 'id,name,account_status,currency,amount_spent,spend_cap',
      limit: 50,
    });
    const accounts = data.filter((row) => row.currency === 'VND').map(toAdAccount);
    if (!accounts.some((a) => a.id === this.config.adAccountId)) {
      const own = await this.authorize();
      accounts.unshift({ id: own.accountId, name: own.accountName, active: true, spendCap: null, amountSpent: null });
    }
    return accounts;
  }

  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    const goal = AD_SET_GOALS[input.objective];
    if (goal.pixelEvent && !this.config.pixelId) {
      throw new AppError('META_PIXEL_REQUIRED', 'Mục tiêu này cần META_PIXEL_ID trong server/.env');
    }

    const account = input.accountId ?? this.config.adAccountId;
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

    let page: MetaGraphClient | undefined;
    let postId: string | undefined;
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

      // A real Page post (not an inline "dark post"), kept hidden until the campaign is switched on;
      // updateStatus publishes it so the ad also shows on the Page's timeline.
      // Meta only lets verified domain owners override the link title (error #100), so the headline
      // leads the post text and the link preview keeps the landing page's own title.
      page = await this.pageGraph();
      const post = await page.post<{ id: string }>(`${this.config.pageId}/feed`, {
        message: `${input.creative.headline}\n\n${input.creative.primaryText}`,
        link: input.creative.landingUrl,
        call_to_action: { type: 'LEARN_MORE', value: { link: input.creative.landingUrl } },
        published: false,
      });
      postId = post.id;

      const creative = await this.graph.post<{ id: string }>(`${account}/adcreatives`, {
        name: `${input.name} - Mẫu quảng cáo`,
        object_story_id: post.id,
      });

      await this.graph.post(`${account}/ads`, {
        name: `${input.name} - Quảng cáo`,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: 'ACTIVE',
      });
    } catch (error) {
      // Don't leave a half-built campaign behind in Ads Manager, nor its hidden post on the Page.
      if (page && postId) await page.delete(postId).catch(() => undefined);
      await this.graph.delete(campaign.id).catch(() => undefined);
      throw error;
    }

    return { externalId: campaign.id, platformObjective: this.mapObjective(input.objective) };
  }

  /** The ad's Page post is on the timeline exactly while the campaign runs. */
  async updateStatus(externalId: string, status: CampaignStatus): Promise<void> {
    const id = assertMetaId(externalId);
    if (status === 'ACTIVE') {
      // Show the post first: if it cannot go public the campaign stays paused, matching AdHub's state.
      await this.setPagePostsVisible(id, true);
      await this.graph.post(id, { status });
      return;
    }
    // Stop spending first; hiding the post is the less urgent half.
    await this.graph.post(id, { status });
    try {
      await this.setPagePostsVisible(id, false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AppError('META_POST_NOT_HIDDEN', `Đã dừng chiến dịch trên Meta nhưng chưa ẩn được bài trên Page: ${reason}`);
    }
  }

  /**
   * Shows or hides the campaign's ad posts on the Page timeline. A hidden post still serves as the ad,
   * so hiding (rather than deleting) lets the campaign be switched back on with the same post.
   * Meta refuses `is_hidden` on the Page's own posts (#100), so this goes through `timeline_visibility`:
   * "hidden" takes the post off the timeline and only "forced_allow" brings it back ("normal" fails).
   */
  private async setPagePostsVisible(campaignId: string, visible: boolean): Promise<void> {
    const { data = [] } = await this.graph.get<{ data?: { creative?: { effective_object_story_id?: string } }[] }>(
      `${campaignId}/ads`,
      { fields: 'creative{effective_object_story_id}' },
    );
    const postIds = [...new Set(data.map((ad) => ad.creative?.effective_object_story_id).filter((id) => id !== undefined))];
    if (postIds.length === 0) return;

    const page = await this.pageGraph();
    for (const postId of postIds) {
      const post = await page.get<{ is_published?: boolean; is_hidden?: boolean }>(postId, {
        fields: 'is_published,is_hidden',
      });
      if (visible) {
        if (post.is_published === false) await page.post(postId, { is_published: true });
        if (post.is_hidden === true) await page.post(postId, { timeline_visibility: 'forced_allow' });
      } else if (post.is_published !== false && post.is_hidden !== true) {
        // Never-published posts are already off the timeline.
        await page.post(postId, { timeline_visibility: 'hidden' });
      }
    }
  }

  async updateBudget(externalId: string, dailyBudget: number): Promise<void> {
    await this.graph.post(assertMetaId(externalId), { daily_budget: dailyBudget });
  }

  async deleteCampaign(externalId: string): Promise<void> {
    // Deleting the campaign also deletes its ad set and ad.
    if (isPlatformCampaignId(externalId)) await this.graph.delete(externalId);
  }

  async fetchDailyMetrics(campaign: Campaign, date: string): Promise<MetricDaily> {
    const { data } = await this.graph.get<{ data: InsightRow[] }>(`${assertMetaId(campaign.externalId)}/insights`, {
      fields: 'spend,impressions,inline_link_clicks,actions,action_values',
      time_range: { since: date, until: date },
    });
    return toDailyMetrics(campaign, date, data[0]);
  }
}

interface MetaAdAccountRow {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  /** Strings in the currency's minor unit; VND has none, so they are whole dong */
  amount_spent?: string;
  spend_cap?: string;
}

/** Meta reports "0" for an account without a spending limit. */
function toAdAccount(row: MetaAdAccountRow): AdAccount {
  const cap = Number(row.spend_cap ?? 0);
  return {
    id: row.id,
    name: row.name,
    active: row.account_status === ACTIVE_ACCOUNT_STATUS,
    spendCap: cap > 0 ? cap : null,
    amountSpent: row.amount_spent === undefined ? null : Number(row.amount_spent),
  };
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
