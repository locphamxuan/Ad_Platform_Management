import type { Campaign, CampaignStatus } from '../domain/types.js';
import { ValidationError } from '../domain/errors.js';
import { sumMetrics, toKpis, type Kpis } from '../domain/metrics.js';
import { formatVnd } from '../domain/format.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignFilter, CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { Actor, ActivityService } from './activity.service.js';
import type { IntegrationService } from './integration.service.js';

export interface CampaignWithKpis extends Campaign {
  connected: boolean;
  kpis: Kpis;
}

export interface BulkStatusResult {
  /** Campaigns now in the requested status, including those that already were */
  updated: number;
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
    const campaign = await this.campaigns.getById(id);
    await this.integrations.assertConnected(campaign.platform);
    if (campaign.status === status) return campaign;

    await this.registry.get(campaign.platform).updateStatus(campaign.externalId, status);
    const updated = await this.campaigns.update(id, { status });
    const verb = status === 'ACTIVE' ? 'Bật' : 'Tạm dừng';
    await this.activity.log(actor, `${verb} chiến dịch "${campaign.name}"`, id);
    return updated;
  }

  /**
   * Bulk pause/activate. Each campaign succeeds or fails on its own (one disconnected platform must
   * not block the rest); calls run one at a time so a large selection does not burst the platform APIs.
   */
  async setStatusMany(ids: string[], status: CampaignStatus, actor: Actor): Promise<BulkStatusResult> {
    const result: BulkStatusResult = { updated: 0, errors: [] };
    for (const id of new Set(ids)) {
      try {
        await this.setStatus(id, status, actor);
        result.updated += 1;
      } catch (error) {
        result.errors.push({ campaignId: id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
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
    await this.activity.log(
      actor,
      `Đổi ngân sách "${campaign.name}": ${formatVnd(campaign.dailyBudget)} → ${formatVnd(dailyBudget)}`,
      id,
    );
    return updated;
  }
}
