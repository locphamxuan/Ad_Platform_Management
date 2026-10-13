import { randomUUID } from 'node:crypto';
import type { Campaign, CampaignStatus, MetricDaily } from '../domain/types.js';
import { ValidationError } from '../domain/errors.js';
import { eachDay, previousRange } from '../domain/dates.js';
import { sumMetrics, toKpis, type Kpis } from '../domain/metrics.js';
import { formatVnd } from '../domain/format.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignFilter, CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { AccountAdvice, AccountAdvisorService, AccountCount } from './account-advisor.service.js';
import type { Actor, ActivityService } from './activity.service.js';
import type { IntegrationService } from './integration.service.js';
import type { NotificationService } from './notification.service.js';

export interface CampaignWithKpis extends Campaign {
  connected: boolean;
  kpis: Kpis;
}

export type DailyPoint = Omit<MetricDaily, 'campaignId'>;

export interface CampaignDetail {
  campaign: CampaignWithKpis;
  /** Same-length period just before the range, for deltas */
  previousKpis: Kpis;
  /** One point per day of the range, zero-filled */
  daily: DailyPoint[];
  /** Where the campaign could run, best fit first */
  advice: AccountAdvice;
  /** Ad accounts per connected platform */
  accountCounts: AccountCount[];
  /** The same multi-channel campaign on the other platforms */
  siblings: Pick<Campaign, 'id' | 'platform' | 'name' | 'status' | 'dailyBudget'>[];
}

export interface BulkStatusResult {
  /** Campaigns now in the requested status, including those that already were */
  updated: number;
  errors: { campaignId: string; message: string }[];
}

export interface BulkDeleteResult {
  deleted: number;
  errors: { campaignId: string; message: string }[];
}

export interface DateRange {
  from: string;
  to: string;
}

export class CampaignService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly metrics: MetricRepository,
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationService,
    private readonly advisor: AccountAdvisorService,
  ) {}

  /** Everything the campaign page shows: results over time, the creative and where it should run. */
  async getDetail(id: string, range: DateRange): Promise<CampaignDetail> {
    const campaign = await this.campaigns.getById(id);
    const connected = (await this.integrations.connectedPlatforms()).has(campaign.platform);
    const previous = previousRange(range);
    const rows = await this.metrics.findInRange(previous.from, range.to, [id]);
    const inRange = rows.filter((r) => r.date >= range.from);
    const byDate = new Map(inRange.map((r) => [r.date, r]));
    const daily = eachDay(range.from, range.to).map((date): DailyPoint => {
      const { campaignId: _campaignId, ...point } = byDate.get(date) ?? emptyDay(id, date);
      return point;
    });

    const accountId = campaign.accountId ?? (await this.integrations.defaultAccountId(campaign.platform));
    const noAdvice: AccountAdvice = { accounts: [], recommendedId: null, lookbackDays: 0 };
    const [advice, accountCounts, siblings] = await Promise.all([
      connected
        ? this.advisor.advise(campaign.platform, {
            objective: campaign.objective,
            dailyBudget: campaign.dailyBudget,
            campaignId: id,
            currentAccountId: accountId,
          })
        : noAdvice,
      this.advisor.counts(),
      campaign.unifiedCampaignId ? this.campaigns.findAll() : Promise.resolve([]),
    ]);

    return {
      campaign: { ...campaign, accountId, connected, kpis: toKpis(sumMetrics(inRange)) },
      previousKpis: toKpis(sumMetrics(rows.filter((r) => r.date < range.from))),
      daily,
      advice,
      accountCounts,
      siblings: siblings
        .filter((c) => c.unifiedCampaignId === campaign.unifiedCampaignId && c.id !== id)
        .map(({ id, platform, name, status, dailyBudget }) => ({ id, platform, name, status, dailyBudget })),
    };
  }

  /**
   * Re-creates the campaign, creative included, in another ad account of the same platform.
   * Platforms cannot move a campaign between accounts, so this is how one changes account;
   * the copy starts paused like every campaign AdHub creates, and the original is left untouched.
   */
  async duplicateToAccount(id: string, accountId: string, actor: Actor): Promise<Campaign> {
    const source = await this.campaigns.getById(id);
    await this.integrations.assertConnected(source.platform);
    if (!source.creative) {
      throw new ValidationError('Chiến dịch này chưa có nội dung quảng cáo lưu trong AdHub nên chưa thể nhân bản');
    }
    const account = (await this.integrations.accounts(source.platform)).find((a) => a.id === accountId);
    if (!account) throw new ValidationError('Tài khoản quảng cáo không thuộc kết nối hiện tại');
    if (!account.active) throw new ValidationError(`Tài khoản "${account.name}" đang bị vô hiệu hoá trên nền tảng`);

    const created = await this.registry.get(source.platform).createCampaign({
      name: source.name,
      objective: source.objective,
      dailyBudget: source.dailyBudget,
      creative: source.creative,
      accountId,
    });
    const copy = await this.campaigns.insert({
      id: randomUUID(),
      platform: source.platform,
      externalId: created.externalId,
      name: source.name,
      objective: source.objective,
      platformObjective: created.platformObjective,
      status: 'PAUSED',
      dailyBudget: source.dailyBudget,
      unifiedCampaignId: source.unifiedCampaignId,
      creative: source.creative,
      accountId,
      createdAt: new Date().toISOString(),
    });
    const message = `Nhân bản "${source.name}" sang tài khoản "${account.name}" (đang tạm dừng chờ duyệt)`;
    await this.activity.log(actor, message, copy.id);
    await this.notifications.notifyOwnersOfBuyerChange(actor, message, copy.id);
    return copy;
  }

  async list(filter: CampaignFilter, range: DateRange): Promise<CampaignWithKpis[]> {
    const [campaigns, connected] = await Promise.all([
      this.campaigns.findAll(filter),
      this.integrations.connectedPlatforms(),
    ]);
    const rows = await this.metrics.findInRange(range.from, range.to, campaigns.map((c) => c.id));
    return campaigns.map((campaign) => ({
      ...campaign,
      connected: connected.has(campaign.platform),
      kpis: toKpis(sumMetrics(rows.filter((r) => r.campaignId === campaign.id))),
    }));
  }

  async getKpis(campaignId: string, range: DateRange): Promise<Kpis> {
    return toKpis(sumMetrics(await this.metrics.findInRange(range.from, range.to, [campaignId])));
  }

  async setStatus(id: string, status: CampaignStatus, actor: Actor): Promise<Campaign> {
    const { campaign, changed } = await this.applyStatus(id, status, actor);
    if (changed) await this.notifications.notifyOwnersOfBuyerChange(actor, describeBatch(statusVerb(status), [campaign.name]), id);
    return campaign;
  }

  /**
   * Bulk pause/activate. Each campaign succeeds or fails on its own (one disconnected platform must
   * not block the rest); calls run one at a time so a large selection does not burst the platform APIs.
   * Owners get one notification for the whole batch instead of one per campaign.
   */
  async setStatusMany(ids: string[], status: CampaignStatus, actor: Actor): Promise<BulkStatusResult> {
    const result: BulkStatusResult = { updated: 0, errors: [] };
    const changedNames: string[] = [];
    for (const id of new Set(ids)) {
      try {
        const { campaign, changed } = await this.applyStatus(id, status, actor);
        result.updated += 1;
        if (changed) changedNames.push(campaign.name);
      } catch (error) {
        result.errors.push({ campaignId: id, message: errorMessage(error) });
      }
    }
    if (changedNames.length > 0) {
      await this.notifications.notifyOwnersOfBuyerChange(actor, describeBatch(statusVerb(status), changedNames));
    }
    return result;
  }

  /**
   * Deletes campaigns on their platform and in AdHub, together with their stored metrics.
   * Like the bulk status change, each campaign succeeds or fails on its own.
   */
  async deleteMany(ids: string[], actor: Actor): Promise<BulkDeleteResult> {
    const result: BulkDeleteResult = { deleted: 0, errors: [] };
    const deletedNames: string[] = [];
    for (const id of new Set(ids)) {
      try {
        const campaign = await this.campaigns.getById(id);
        await this.integrations.assertConnected(campaign.platform);
        await this.registry.get(campaign.platform).deleteCampaign(campaign.externalId);
        await this.campaigns.delete(id);
        await this.metrics.deleteForCampaign(id);
        await this.activity.log(actor, `Xoá chiến dịch "${campaign.name}"`, id);
        result.deleted += 1;
        deletedNames.push(campaign.name);
      } catch (error) {
        result.errors.push({ campaignId: id, message: errorMessage(error) });
      }
    }
    if (deletedNames.length > 0) {
      await this.notifications.notifyOwnersOfBuyerChange(actor, describeBatch('Xoá', deletedNames));
    }
    return result;
  }

  private async applyStatus(id: string, status: CampaignStatus, actor: Actor): Promise<{ campaign: Campaign; changed: boolean }> {
    const campaign = await this.campaigns.getById(id);
    await this.integrations.assertConnected(campaign.platform);
    if (campaign.status === status) return { campaign, changed: false };

    await this.registry.get(campaign.platform).updateStatus(campaign.externalId, status);
    const updated = await this.campaigns.update(id, { status });
    await this.activity.log(actor, `${statusVerb(status)} chiến dịch "${campaign.name}"`, id);
    return { campaign: updated, changed: true };
  }

  async setBudget(id: string, dailyBudget: number, actor: Actor): Promise<Campaign> {
    const campaign = await this.campaigns.getById(id);
    await this.integrations.assertConnected(campaign.platform);
    const adapter = this.registry.get(campaign.platform);
    if (dailyBudget < adapter.minDailyBudget) {
      throw new ValidationError(
        `${adapter.displayName} yêu cầu ngân sách tối thiểu ${formatVnd(adapter.minDailyBudget)}/ngày`,
      );
    }
    if (campaign.dailyBudget === dailyBudget) return campaign;

    await adapter.updateBudget(campaign.externalId, dailyBudget);
    const updated = await this.campaigns.update(id, { dailyBudget });
    const message = `Đổi ngân sách "${campaign.name}": ${formatVnd(campaign.dailyBudget)} → ${formatVnd(dailyBudget)}`;
    await this.activity.log(actor, message, id);
    await this.notifications.notifyOwnersOfBuyerChange(actor, message, id);
    return updated;
  }
}

const statusVerb = (status: CampaignStatus) => (status === 'ACTIVE' ? 'Bật' : 'Tạm dừng');

const emptyDay = (campaignId: string, date: string): MetricDaily => ({
  campaignId,
  date,
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
});

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const NAMES_SHOWN = 3;

/** "Xoá chiến dịch "A"" for one campaign, "Xoá 5 chiến dịch: "A", "B", "C" và 2 chiến dịch khác" for a batch. */
export function describeBatch(verb: string, names: readonly string[]): string {
  if (names.length === 1) return `${verb} chiến dịch "${names[0]}"`;
  const shown = names.slice(0, NAMES_SHOWN).map((name) => `"${name}"`).join(', ');
  const rest = names.length - NAMES_SHOWN;
  return `${verb} ${names.length} chiến dịch: ${shown}${rest > 0 ? ` và ${rest} chiến dịch khác` : ''}`;
}
