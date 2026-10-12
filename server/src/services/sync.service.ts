import { today } from '../domain/dates.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { IntegrationService } from './integration.service.js';

/** Pulls today's insights for active campaigns from each connected platform. */
export class SyncService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly metrics: MetricRepository,
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
  ) {}

  async syncToday(): Promise<number> {
    const date = today();
    const [active, connected] = await Promise.all([
      this.campaigns.findAll({ status: 'ACTIVE' }),
      this.integrations.connectedPlatforms(),
    ]);
    const targets = active.filter((c) => connected.has(c.platform));

    // One failing campaign (e.g. a Meta API error) must not block the others.
    const results = await Promise.allSettled(
      targets.map((c) => this.registry.get(c.platform).fetchDailyMetrics(c, date)),
    );
    const rows = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const failures = results.length - rows.length;
    if (failures > 0) {
      const reasons = new Set(results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as Error).message] : [])));
      console.warn(`[sync] ${failures} campaign(s) skipped: ${[...reasons].join(' | ')}`);
    }
    if (rows.length > 0) await this.metrics.upsertMany(rows);
    return rows.length;
  }
}
