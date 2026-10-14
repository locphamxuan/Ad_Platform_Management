import { today } from '../domain/dates.js';
import { isPlatformCampaignId } from '../adapters/ad-platform.adapter.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { IntegrationService } from './integration.service.js';
import type { ActivityService, Actor } from './activity.service.js';
import type { Campaign } from '../domain/types.js';

const SYSTEM_ACTOR: Actor = { type: 'system', name: 'Đồng bộ hệ thống' };

/** Pulls today's insights and synchronizes statuses from connected platforms. */
export class SyncService {
  private rateLimitUntil = 0;

  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly metrics: MetricRepository,
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
    private readonly activity?: ActivityService,
  ) {}

  async syncToday(): Promise<number> {
    const date = today();
    const [active, connected] = await Promise.all([
      this.campaigns.findAll({ status: 'ACTIVE' }),
      this.integrations.connectedPlatforms(),
    ]);
    const targets = active.filter((c) => connected.has(c.platform) && !c.meta?.deletedOnMeta);

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

  /**
   * Synchronizes live campaign statuses, budgets, and reviews from Meta every 5 minutes.
   */
  async syncStatuses(): Promise<number> {
    if (Date.now() < this.rateLimitUntil) {
      console.log('[sync] Meta rate limited, skipping status sync until backoff expires');
      return 0;
    }

    const connected = await this.integrations.connectedPlatforms();
    if (!connected.has('facebook')) return 0;

    const allFbCampaigns = await this.campaigns.findAll({ platform: 'facebook' });
    const activeTargets = allFbCampaigns.filter(
      (c) => isPlatformCampaignId(c.externalId) && !c.meta?.deletedOnMeta,
    );
    if (activeTargets.length === 0) return 0;

    const adapter = this.registry.get('facebook');
    if (!adapter.fetchStatuses) return 0;

    let updatedCount = 0;
    try {
      const externalIds = activeTargets.map((c) => c.externalId);
      const statusMap = await adapter.fetchStatuses(externalIds);

      for (const campaign of activeTargets) {
        const info = statusMap[campaign.externalId];
        if (!info) continue;

        const changes: Partial<Campaign> = {};
        const wasActive = campaign.status === 'ACTIVE';
        const nowActive = info.status === 'ACTIVE';

        if (info.deletedOnMeta) {
          changes.meta = {
            ...(campaign.meta || { ads: [] }),
            deletedOnMeta: true,
            syncedAt: new Date().toISOString(),
          };
          await this.campaigns.update(campaign.id, changes);
          updatedCount++;
          continue;
        }

        if (wasActive !== nowActive) {
          changes.status = nowActive ? 'ACTIVE' : 'PAUSED';
          if (!wasActive && nowActive && this.activity) {
            await this.activity.log(SYSTEM_ACTOR, `Chiến dịch "${campaign.name}" đã được bật trên Meta`, campaign.id);
          }
        }

        if (info.dailyBudget && info.dailyBudget !== campaign.dailyBudget) {
          changes.dailyBudget = info.dailyBudget;
          if (this.activity) {
            await this.activity.log(SYSTEM_ACTOR, `Đồng bộ thay đổi ngân sách từ Meta cho "${campaign.name}"`, campaign.id);
          }
        }

        if (info.schedule) {
          changes.schedule = info.schedule;
        }

        changes.meta = {
          ...(campaign.meta || { ads: [] }),
          effectiveStatus: info.effectiveStatus,
          deletedOnMeta: false,
          syncedAt: new Date().toISOString(),
        };

        await this.campaigns.update(campaign.id, changes);
        updatedCount++;
      }
    } catch (err: any) {
      if (err.metaCode === 17 || err.metaCode === 4 || err.metaCode === 32 || err.metaCode === 613) {
        // Rate limit backoff for 5 minutes
        this.rateLimitUntil = Date.now() + 5 * 60 * 1000;
        console.warn('[sync] Meta hit rate limit during fetchStatuses, backing off 5m');
      } else {
        console.warn(`[sync] fetchStatuses failed: ${err.message}`);
      }
    }

    return updatedCount;
  }
}
