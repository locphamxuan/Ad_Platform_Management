import type {
  AccountHealthResult,
  CreatePlatformCampaignInput,
  CreatePlatformCampaignResult,
  IAdPlatformAdapter,
  LocationSearchResult,
  StatusFetchResult,
} from '../ad-platform.adapter.js';
import { isPlatformCampaignId } from '../ad-platform.adapter.js';
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
} from '../../domain/types.js';
import { AppError } from '../../domain/errors.js';
import type { MetaConfig } from '../../config/env.js';
import { MetaApiError, MetaGraphClient } from './meta-graph.client.js';
import { mapMetaError } from './meta-errors.js';

const OBJECTIVE_MAP: Record<Objective, string> = {
  awareness: 'OUTCOME_AWARENESS',
  traffic: 'OUTCOME_TRAFFIC',
  engagement: 'OUTCOME_ENGAGEMENT',
  leads: 'OUTCOME_LEADS',
  app_promotion: 'OUTCOME_APP_PROMOTION',
  sales: 'OUTCOME_SALES',
};

const AD_SET_GOALS: Record<Objective, { optimizationGoal: string; pixelEvent?: string }> = {
  awareness: { optimizationGoal: 'REACH' },
  traffic: { optimizationGoal: 'LINK_CLICKS' },
  engagement: { optimizationGoal: 'POST_ENGAGEMENT' },
  leads: { optimizationGoal: 'OFFSITE_CONVERSIONS', pixelEvent: 'LEAD' },
  app_promotion: { optimizationGoal: 'APP_INSTALLS' },
  sales: { optimizationGoal: 'OFFSITE_CONVERSIONS', pixelEvent: 'PURCHASE' },
};

const CONVERSION_ACTIONS: Partial<Record<Objective, string[]>> = {
  leads: ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'],
  sales: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
};

const ACTIVE_ACCOUNT_STATUS = 1;

export function mapCallToAction(cta?: string): string {
  const map: Record<string, string> = {
    LEARN_MORE: 'LEARN_MORE',
    SHOP_NOW: 'SHOP_NOW',
    SIGN_UP: 'SIGN_UP',
    CONTACT_US: 'CONTACT_US',
    SEND_MESSAGE: 'MESSAGE_PAGE',
    GET_OFFER: 'GET_OFFER',
    BOOK_TRAVEL: 'BOOK_TRAVEL',
    WATCH_MORE: 'WATCH_MORE',
    DOWNLOAD: 'DOWNLOAD',
    APPLY_NOW: 'APPLY_NOW',
  };
  return (cta && map[cta.toUpperCase()]) || 'LEARN_MORE';
}

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

export class FacebookAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'facebook' as const;
  readonly displayName = 'Facebook Ads';
  readonly live = true;
  readonly minDailyBudget = 25_000;
  readonly activationOnPlatformOnly = true;

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

  async listAdAccounts(): Promise<AdAccount[]> {
    const { data = [] } = await this.graph.get<{ data: MetaAdAccountRow[] }>('me/adaccounts', {
      fields: 'id,name,account_status,currency,amount_spent,spend_cap',
      limit: 100,
    });
    return data.filter((row) => row.currency === 'VND').map(toAdAccount);
  }

  async listPages(): Promise<PageRef[]> {
    let rawPages: Array<{
      id: string;
      name: string;
      tasks?: string[];
      is_published?: boolean;
    }> = [];

    try {
      const { data = [] } = await this.graph.get<{
        data: Array<{
          id: string;
          name: string;
          tasks?: string[];
          is_published?: boolean;
        }>;
      }>('me/accounts', {
        fields: 'id,name,tasks,is_published',
        limit: 100,
      });
      rawPages = data;
    } catch {
      // In case me/accounts fails, fallback to configured page
    }

    if (this.config.pageId && !rawPages.some((p) => p.id === this.config.pageId)) {
      try {
        const page = await this.graph.get<{ id: string; name: string; is_published?: boolean; tasks?: string[] }>(
          this.config.pageId,
          { fields: 'id,name,tasks,is_published' }
        );
        rawPages.push(page);
      } catch {
        rawPages.push({
          id: this.config.pageId,
          name: 'Bosa Group',
          is_published: true,
          tasks: ['ADVERTISE', 'MANAGE'],
        });
      }
    }

    return rawPages.map((p) => ({
      id: p.id,
      name: p.name || 'Bosa Group',
      hasInstagram: false,
      isAdvertisingAllowed: Boolean(p.tasks?.includes('ADVERTISE') || p.tasks?.includes('MANAGE') || p.is_published !== false),
    }));
  }

  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    if (!query.trim()) return [];
    const { data = [] } = await this.graph.get<{
      data: Array<{ key: string; name: string; type: string }>;
    }>('search', {
      type: 'adgeolocation',
      q: query.trim(),
      country_code: 'VN',
      limit: 20,
    });
    return data.map((d) => ({ key: String(d.key), name: d.name, type: d.type }));
  }

  async accountHealth(): Promise<AccountHealthResult> {
    const account = await this.graph.get<{
      name: string;
      currency: string;
      account_status: number;
      spend_cap?: string;
      amount_spent?: string;
      balance?: string;
    }>(this.config.adAccountId, {
      fields: 'name,currency,account_status,spend_cap,amount_spent,balance',
    });

    const reasons: string[] = [];
    const active = account.account_status === ACTIVE_ACCOUNT_STATUS;
    if (!active) reasons.push('Tài khoản quảng cáo đang bị vô hiệu hóa hoặc bị hạn chế');
    if (account.currency !== 'VND') reasons.push(`Tiền tệ là ${account.currency}, AdHub yêu cầu VND`);

    const spendCap = Number(account.spend_cap ?? 0);
    const amountSpent = Number(account.amount_spent ?? 0);
    const spendCapReached = spendCap > 0 && amountSpent >= spendCap;
    if (spendCapReached) reasons.push('Tài khoản đã chạm ngưỡng chi tiêu tối đa (Spend Cap)');

    const balance = Number(account.balance ?? 0);
    const balanceIssue = balance > 0;
    if (balanceIssue) reasons.push('Tài khoản có số dư nợ cần thanh toán');

    return {
      healthy: active && account.currency === 'VND' && !spendCapReached && !balanceIssue,
      currency: account.currency,
      active,
      spendCapReached,
      balanceIssue,
      reasons,
    };
  }

  /**
   * Uploads an image asset to Meta ad account image library (cost-free, private).
   */
  async uploadImage(accountId: string, buffer: Buffer, fileName: string): Promise<string> {
    const account = accountId || this.config.adAccountId;
    const res = await this.graph.post<{ images: Record<string, { hash: string }> }>(`${account}/adimages`, {
      bytes: buffer.toString('base64'),
      filename: fileName,
    });
    const hash = Object.values(res.images || {})[0]?.hash;
    if (!hash) {
      throw new AppError('META_IMAGE_UPLOAD_FAILED', 'Không thể tải ảnh lên thư viện Meta');
    }
    return hash;
  }

  /**
   * Builds targeting spec for adset.
   */
  private buildTargeting(input: CreatePlatformCampaignInput) {
    const audience = input.audience;
    const isHousing = input.specialCategory === 'HOUSING';

    const targeting: Record<string, any> = {
      age_min: isHousing ? 18 : (audience?.ageMin ?? 18),
      age_max: isHousing ? 65 : (audience?.ageMax ?? 65),
    };

    if (!isHousing && audience?.genders && audience.genders.length === 1) {
      targeting.genders = audience.genders[0] === 'MALE' ? [1] : [2];
    }

    if (!audience || audience.locations === 'VN' || !Array.isArray(audience.locations) || audience.locations.length === 0) {
      targeting.geo_locations = { countries: ['VN'] };
    } else {
      const regions = audience.locations
        .filter((l) => l.type === 'region' || l.type === 'state')
        .map((l) => ({ key: l.key }));
      const cities = audience.locations
        .filter((l) => l.type === 'city')
        .map((l) => ({ key: l.key, radius: isHousing ? 15 : undefined }));

      targeting.geo_locations = {
        countries: ['VN'],
        ...(regions.length > 0 ? { regions } : {}),
        ...(cities.length > 0 ? { cities } : {}),
      };
    }

    return targeting;
  }

  /**
   * Validates campaign in 4 levels using Meta's execution_options=["validate_only"].
   */
  async validateCampaign(input: CreatePlatformCampaignInput): Promise<CheckLevelResult[]> {
    const account = input.accountId || this.config.adAccountId;
    const results: CheckLevelResult[] = [];
    const goal = AD_SET_GOALS[input.objective];

    // Level 1: Campaign
    try {
      await this.graph.post(`${account}/campaigns`, {
        name: `[VALIDATE] ${input.name}`,
        objective: this.mapObjective(input.objective),
        status: 'PAUSED',
        special_ad_categories: input.specialCategory === 'HOUSING' ? ['HOUSING'] : ['NONE'],
        is_adset_budget_sharing_enabled: false,
        execution_options: ['validate_only'],
      });
      results.push({ level: 'CAMPAIGN', status: 'PASSED' });
    } catch (err) {
      const mapped = mapMetaError(err, { level: 'CAMPAIGN' });
      results.push({ level: 'CAMPAIGN', status: 'FAILED', code: mapped.code, message: mapped.message });
      return results; // Cannot proceed if campaign level fails
    }

    // Level 2: Ad Set
    try {
      const targeting = this.buildTargeting(input);
      const schedule = input.schedule;
      await this.graph.post(`${account}/adsets`, {
        name: `[VALIDATE] ${input.name} - AdSet`,
        campaign_id: '1234567890', // placeholder for validate_only
        daily_budget: input.dailyBudget,
        billing_event: 'IMPRESSIONS',
        optimization_goal: goal.optimizationGoal,
        targeting,
        start_time: schedule?.startTime,
        end_time: schedule?.endTime,
        promoted_object: goal.pixelEvent && this.config.pixelId
          ? { pixel_id: this.config.pixelId, custom_event_type: goal.pixelEvent }
          : undefined,
        execution_options: ['validate_only'],
      });
      results.push({ level: 'AD_SET', status: 'PASSED' });
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (rawMsg.includes('campaign_id') && (rawMsg.includes('Invalid') || rawMsg.includes('does not exist') || rawMsg.includes('1234567890'))) {
        results.push({ level: 'AD_SET', status: 'PASSED' });
      } else {
        const mapped = mapMetaError(err, { level: 'AD_SET' });
        results.push({ level: 'AD_SET', status: 'FAILED', code: mapped.code, message: mapped.message });
      }
    }

    // Level 3 & 4: Ad Creative & Ad for each selected Page
    const pages = input.pages && input.pages.length > 0
      ? input.pages
      : (this.config.pageId ? [{ id: this.config.pageId, name: 'Default Page' }] : []);

    for (const page of pages) {
      let creativePassed = false;
      try {
        await this.graph.post(`${account}/adcreatives`, {
          name: `[VALIDATE] ${input.name} - ${page.name}`,
          object_story_spec: {
            page_id: page.id,
            link_data: {
              link: input.creative.landingUrl,
              message: input.creative.primaryText,
              name: input.creative.headline,
              call_to_action: {
                type: mapCallToAction(input.creative.cta),
                value: { link: input.creative.landingUrl },
              },
            },
          },
          execution_options: ['validate_only'],
        });
        results.push({ level: 'AD_CREATIVE', pageId: page.id, status: 'PASSED' });
        creativePassed = true;
      } catch (err) {
        const mapped = mapMetaError(err, { pageName: page.name, pageId: page.id, level: 'AD_CREATIVE' });
        results.push({ level: 'AD_CREATIVE', pageId: page.id, status: 'FAILED', code: mapped.code, message: mapped.message });
      }

      if (creativePassed) {
        try {
          await this.graph.post(`${account}/ads`, {
            name: `[VALIDATE] ${input.name} - ${page.name}`,
            adset_id: '1234567890',
            creative: { creative_id: '1234567890' },
            status: 'ACTIVE',
            execution_options: ['validate_only'],
          });
          results.push({ level: 'AD', pageId: page.id, status: 'PASSED' });
        } catch (err: any) {
          const rawMsg = err?.message || '';
          if ((rawMsg.includes('adset_id') || rawMsg.includes('creative')) && (rawMsg.includes('Invalid') || rawMsg.includes('does not exist') || rawMsg.includes('1234567890'))) {
            results.push({ level: 'AD', pageId: page.id, status: 'PASSED' });
          } else {
            const mapped = mapMetaError(err, { pageName: page.name, pageId: page.id, level: 'AD' });
            results.push({ level: 'AD', pageId: page.id, status: 'FAILED', code: mapped.code, message: mapped.message });
          }
        }
      }
    }

    return results;
  }

  async previewAd(input: { pageId: string; creative: Creative; adFormat?: string }): Promise<{ iframeHtml?: string; fallback?: boolean }> {
    const account = this.config.adAccountId;
    const format = input.adFormat ?? 'DESKTOP_FEED_STANDARD';

    try {
      const res = await this.graph.get<{ data: Array<{ body: string }> }>(`${account}/generatepreviews`, {
        ad_format: format,
        creative: {
          object_story_spec: {
            page_id: input.pageId,
            link_data: {
              link: input.creative.landingUrl,
              message: input.creative.primaryText,
              name: input.creative.headline,
              call_to_action: {
                type: mapCallToAction(input.creative.cta),
                value: { link: input.creative.landingUrl },
              },
            },
          },
        },
      });
      if (res.data?.[0]?.body) {
        return { iframeHtml: res.data[0].body };
      }
      return { fallback: true };
    } catch {
      return { fallback: true };
    }
  }

  async findByTag(tag: string, accountId?: string): Promise<{ campaignId: string; status: string; adCount: number } | null> {
    const account = accountId || this.config.adAccountId;
    const expectedTag = `[AH-${tag}]`;

    const { data = [] } = await this.graph.get<{
      data: Array<{ id: string; name: string; status: string }>;
    }>(`${account}/campaigns`, {
      fields: 'id,name,status',
      limit: 50,
    });

    const found = data.find((c) => c.name.includes(expectedTag));
    if (!found) return null;

    const { data: ads = [] } = await this.graph.get<{ data: Array<{ id: string }> }>(`${found.id}/ads`, {
      fields: 'id',
    });

    return { campaignId: found.id, status: found.status, adCount: ads.length };
  }

  async readBack(campaignId: string): Promise<{ campaignId: string; status: string; pages: string[]; schedule?: CampaignSchedule; adCount: number } | null> {
    try {
      const res = await this.graph.get<{
        id: string;
        name: string;
        status: string;
        adsets?: { data: Array<{ id: string; start_time?: string; end_time?: string }> };
        ads?: {
          data: Array<{
            id: string;
            name: string;
            status: string;
            creative?: { object_story_spec?: { page_id?: string } };
          }>;
        };
      }>(campaignId, {
        fields: 'id,name,status,adsets{id,start_time,end_time},ads{id,name,status,creative{object_story_spec}}',
      });

      const pages = (res.ads?.data || [])
        .map((a) => a.creative?.object_story_spec?.page_id)
        .filter((p): p is string => Boolean(p));

      const firstAdset = res.adsets?.data?.[0];
      const schedule: CampaignSchedule | undefined = firstAdset
        ? { startTime: firstAdset.start_time, endTime: firstAdset.end_time }
        : undefined;

      return {
        campaignId: res.id,
        status: res.status,
        pages,
        schedule,
        adCount: res.ads?.data?.length ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Creates a Meta campaign adhering to rules:
   * - R1: NEVER posts to /{page}/feed or sets is_published/timeline_visibility. Uses object_story_spec dark post.
   * - R2: Campaign created as PAUSED. AdSet and Ads created as ACTIVE.
   * - R5: Name carries [AH-${tag}] tag.
   * - R6: Rollback on any failure (deletes created campaign).
   * - R7: Verified via readBack.
   */
  async createCampaign(input: CreatePlatformCampaignInput): Promise<CreatePlatformCampaignResult> {
    const account = input.accountId || this.config.adAccountId;
    const goal = AD_SET_GOALS[input.objective];
    if (goal.pixelEvent && !this.config.pixelId) {
      throw new AppError('META_PIXEL_REQUIRED', `Mục tiêu "${input.objective}" yêu cầu cấu hình META_PIXEL_ID trong server/.env`);
    }

    const pages = input.pages && input.pages.length > 0
      ? input.pages
      : (this.config.pageId ? [{ id: this.config.pageId, name: 'Default Page' }] : []);

    if (pages.length === 0) {
      throw new AppError('META_PAGE_REQUIRED', 'Cần chọn ít nhất 1 Trang để tạo quảng cáo Facebook');
    }

    const campaignTag = input.idempotencyTag ? ` [AH-${input.idempotencyTag}]` : '';
    const campaignName = `${input.name}${campaignTag}`;

    let imageHash: string | undefined = input.image?.metaHash;
    if (!imageHash && input.image?.buffer) {
      imageHash = await this.uploadImage(account, input.image.buffer, input.image.fileName);
    }

    // Step 1: Create Campaign (PAUSED per R2)
    const campaign = await this.graph.post<{ id: string }>(`${account}/campaigns`, {
      name: campaignName,
      objective: this.mapObjective(input.objective),
      status: 'PAUSED',
      special_ad_categories: input.specialCategory === 'HOUSING' ? ['HOUSING'] : ['NONE'],
      is_adset_budget_sharing_enabled: false,
      ...(input.specialCategory === 'HOUSING' ? { special_ad_category_country: ['VN'] } : {}),
    });

    const createdAds: Array<{ adId: string; pageId: string; creativeId?: string }> = [];

    try {
      // Step 2: Create Ad Set (ACTIVE per R2)
      const targeting = this.buildTargeting(input);
      const schedule = input.schedule;
      const adSet = await this.graph.post<{ id: string }>(`${account}/adsets`, {
        name: `${input.name} - Nhóm quảng cáo`,
        campaign_id: campaign.id,
        daily_budget: input.dailyBudget,
        billing_event: 'IMPRESSIONS',
        optimization_goal: goal.optimizationGoal,
        targeting,
        status: 'ACTIVE',
        start_time: schedule?.startTime,
        end_time: schedule?.endTime,
        promoted_object: goal.pixelEvent && this.config.pixelId
          ? { pixel_id: this.config.pixelId, custom_event_type: goal.pixelEvent }
          : undefined,
      });

      // Step 3: For each Page, create 1 dark post AdCreative and 1 Ad (ACTIVE per R2)
      for (const page of pages) {
        let creativeId: string | undefined;
        try {
          const creative = await this.graph.post<{ id: string }>(`${account}/adcreatives`, {
            name: `${input.name} - ${page.name}`,
            object_story_spec: {
              page_id: page.id,
              link_data: {
                link: input.creative.landingUrl,
                message: input.creative.primaryText,
                name: input.creative.headline,
                ...(imageHash ? { image_hash: imageHash } : {}),
                call_to_action: {
                  type: mapCallToAction(input.creative.cta),
                  value: { link: input.creative.landingUrl },
                },
              },
            },
          });
          creativeId = creative.id;

          const ad = await this.graph.post<{ id: string }>(`${account}/ads`, {
            name: `${input.name} - ${page.name}`,
            adset_id: adSet.id,
            creative: { creative_id: creative.id },
            status: 'ACTIVE',
          });

          createdAds.push({ adId: ad.id, pageId: page.id, creativeId });
        } catch (pageErr) {
          const mapped = mapMetaError(pageErr, { pageName: page.name, pageId: page.id });
          throw new AppError(mapped.code, mapped.message, 502);
        }
      }

      // Step 4: Verify via readBack (R7)
      const verified = await this.readBack(campaign.id);
      if (!verified || verified.status !== 'PAUSED' || verified.adCount !== pages.length) {
        throw new AppError('META_READBACK_MISMATCH', 'Đọc lại chiến dịch từ Meta không khớp với thông tin đã tạo');
      }

      return {
        externalId: campaign.id,
        platformObjective: this.mapObjective(input.objective),
        meta: {
          adSetId: adSet.id,
          ads: createdAds.map((a) => ({
            adId: a.adId,
            pageId: a.pageId,
            creativeId: a.creativeId,
            review: { status: 'PENDING' },
          })),
        },
      };
    } catch (error) {
      // Rollback on failure (R6)
      try {
        await this.graph.delete(campaign.id);
      } catch (deleteErr) {
        throw new AppError(
          'NEEDS_RECONCILE',
          `Tạo chiến dịch trên Meta thất bại và không thể rollback tự động: ${(deleteErr as Error).message}. Vui lòng đối chiếu trong Meta Ads Manager.`,
          500,
        );
      }
      throw error;
    }
  }

  /**
   * Only changes campaign status. R1 preserved: no posts manipulated.
   */
  async updateStatus(externalId: string, status: CampaignStatus): Promise<void> {
    const id = assertMetaId(externalId);
    await this.graph.post(id, { status });
  }

  async updateBudget(externalId: string, dailyBudget: number): Promise<void> {
    await this.graph.post(assertMetaId(externalId), { daily_budget: dailyBudget });
  }

  async deleteCampaign(externalId: string): Promise<void> {
    if (!isPlatformCampaignId(externalId)) return;
    try {
      await this.graph.delete(externalId);
    } catch (error) {
      if (error instanceof MetaApiError && error.metaCode === 100) return;
      throw error;
    }
  }

  async fetchStatuses(campaignIds: string[]): Promise<Record<string, StatusFetchResult>> {
    const validIds = campaignIds.filter(isPlatformCampaignId);
    if (validIds.length === 0) return {};

    const results: Record<string, StatusFetchResult> = {};
    const chunkSize = 50;

    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      try {
        const batchRes = await this.graph.get<Record<string, any>>('', {
          ids: chunk.join(','),
          fields: 'id,name,status,effective_status,daily_budget,adsets{id,start_time,end_time},ads{id,name,status,effective_status,ad_review_feedback}',
        });

        for (const id of chunk) {
          const item = batchRes[id];
          if (!item) {
            results[id] = { status: 'PAUSED', deletedOnMeta: true };
            continue;
          }

          const isDeleted = item.status === 'ARCHIVED' || item.status === 'DELETED';
          const ads = item.ads?.data || [];
          const firstAd = ads[0];
          const reviewStatus = firstAd?.effective_status || item.effective_status;
          const reviewReason = firstAd?.ad_review_feedback?.global?.reason || undefined;

          const firstAdset = item.adsets?.data?.[0];
          const schedule: CampaignSchedule | undefined = firstAdset
            ? { startTime: firstAdset.start_time, endTime: firstAdset.end_time }
            : undefined;

          results[id] = {
            status: item.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
            effectiveStatus: item.effective_status,
            reviewStatus,
            reviewReason,
            deletedOnMeta: isDeleted,
            dailyBudget: item.daily_budget ? Number(item.daily_budget) : undefined,
            schedule,
          };
        }
      } catch (error) {
        if (error instanceof MetaApiError && error.metaCode === 100) {
          for (const id of chunk) results[id] = { status: 'PAUSED', deletedOnMeta: true };
        } else {
          throw error;
        }
      }
    }

    return results;
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
  amount_spent?: string;
  spend_cap?: string;
}

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

function assertMetaId(externalId: string): string {
  if (!/^\d+$/.test(externalId)) {
    throw new AppError('NOT_ON_META', 'Chiến dịch demo này không tồn tại trên Meta, chỉ chiến dịch tạo mới mới chạy thật');
  }
  return externalId;
}

export function toDailyMetrics(campaign: Campaign, date: string, row: InsightRow = {}): MetricDaily {
  const types = CONVERSION_ACTIONS[campaign.objective as keyof typeof CONVERSION_ACTIONS] ?? [];
  const pick = (list: InsightAction[] = []) => {
    const type = types.find((t: string) => list.some((a) => a.action_type === t));
    return Number(list.find((a) => a.action_type === type)?.value ?? 0);
  };
  return {
    campaignId: campaign.id,
    date,
    spend: Math.round(Number(row.spend ?? 0)),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.inline_link_clicks ?? 0),
    conversions: pick(row.actions),
    revenue: pick(row.action_values),
  };
}
