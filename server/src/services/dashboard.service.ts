import type { MetricDaily, Platform } from '../domain/types.js';
import { sumMetrics, toKpis } from '../domain/metrics.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { DateRange } from './campaign.service.js';
import type { IntegrationService } from './integration.service.js';

type DailySpendPoint = { date: string } & Partial<Record<Platform, number>>;

export class DashboardService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly metrics: MetricRepository,
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
  ) {}

  async getSummary(range: DateRange) {
    const connectedPlatforms = await this.integrations.connectedPlatforms();
    const connected = this.registry.all().filter((a) => connectedPlatforms.has(a.platform));
    const campaigns = (await this.campaigns.findAll()).filter((c) =>
      connectedPlatforms.has(c.platform),
    );
    const platformByCampaign = new Map(campaigns.map((c) => [c.id, c.platform]));
    const rows = await this.metrics.findInRange(range.from, range.to, [
      ...platformByCampaign.keys(),
    ]);

    const byPlatform = connected.map((adapter) => {
      const platformCampaigns = campaigns.filter((c) => c.platform === adapter.platform);
      const platformRows = rows.filter(
        (r) => platformByCampaign.get(r.campaignId) === adapter.platform,
      );
      return {
        platform: adapter.platform,
        displayName: adapter.displayName,
        activeCampaigns: platformCampaigns.filter((c) => c.status === 'ACTIVE').length,
        totalCampaigns: platformCampaigns.length,
        kpis: toKpis(sumMetrics(platformRows)),
      };
    });

    return {
      range,
      totals: toKpis(sumMetrics(rows)),
      byPlatform,
      dailySpend: this.buildDailySpend(rows, platformByCampaign),
    };
  }

  private buildDailySpend(rows: MetricDaily[], platformByCampaign: Map<string, Platform>) {
    const byDate = new Map<string, DailySpendPoint>();
    for (const row of rows) {
      const platform = platformByCampaign.get(row.campaignId);
      if (!platform) continue;
      const point = byDate.get(row.date) ?? { date: row.date };
      point[platform] = (point[platform] ?? 0) + row.spend;
      byDate.set(row.date, point);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
