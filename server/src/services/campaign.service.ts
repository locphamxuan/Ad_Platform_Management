import type { Campaign, CampaignStatus } from '../domain/types.js';
import { ValidationError } from '../domain/errors.js';
import { sumMetrics, toKpis, type Kpis } from '../domain/metrics.js';
import { formatVnd } from '../domain/format.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignFilter, CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { Actor, ActivityService } from './activity.service.js';
import type { IntegrationService } from './integration.service.js';
import type { NotificationService } from './notification.service.js';

export interface CampaignWithKpis extends Campaign {
  connected: boolean;
  kpis: Kpis;
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
  ) {}

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

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const NAMES_SHOWN = 3;

/** "Xoá chiến dịch "A"" for one campaign, "Xoá 5 chiến dịch: "A", "B", "C" và 2 chiến dịch khác" for a batch. */
export function describeBatch(verb: string, names: readonly string[]): string {
  if (names.length === 1) return `${verb} chiến dịch "${names[0]}"`;
  const shown = names.slice(0, NAMES_SHOWN).map((name) => `"${name}"`).join(', ');
  const rest = names.length - NAMES_SHOWN;
  return `${verb} ${names.length} chiến dịch: ${shown}${rest > 0 ? ` và ${rest} chiến dịch khác` : ''}`;
}
