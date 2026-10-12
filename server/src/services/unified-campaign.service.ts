import { randomUUID } from 'node:crypto';
import type { Campaign, Creative, Objective, Platform } from '../domain/types.js';
import { allocateBudget, type BudgetAllocationInput } from '../domain/budget.js';
import { AppError } from '../domain/errors.js';
import { formatVnd } from '../domain/format.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { Actor, ActivityService } from './activity.service.js';
import type { IntegrationService } from './integration.service.js';

export interface CreateUnifiedCampaignInput {
  name: string;
  objective: Objective;
  totalDailyBudget: number;
  allocations: BudgetAllocationInput[];
  creative: Creative;
}

export type PlatformPublishResult =
  | { platform: Platform; success: true; campaign: Campaign }
  | { platform: Platform; success: false; error: string };

/**
 * "Create once, run everywhere": each platform is published independently, so one
 * failing channel never blocks the others. Campaigns always start PAUSED for review.
 */
export class UnifiedCampaignService {
  constructor(
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
    private readonly campaigns: CampaignRepository,
    private readonly activity: ActivityService,
  ) {}

  async create(input: CreateUnifiedCampaignInput, actor: Actor) {
    const unifiedCampaignId = randomUUID();
    const allocations = allocateBudget(input.totalDailyBudget, input.allocations);

    const results = await Promise.all(
      allocations.map(({ platform, dailyBudget }) =>
        this.publishToPlatform(unifiedCampaignId, input, platform, dailyBudget),
      ),
    );

    const succeeded = results.filter((r) => r.success).length;
    await this.activity.log(
      actor,
      `Tạo chiến dịch đa kênh "${input.name}" — thành công ${succeeded}/${results.length} kênh`,
    );
    return { unifiedCampaignId, results };
  }

  private async publishToPlatform(
    unifiedCampaignId: string,
    input: CreateUnifiedCampaignInput,
    platform: Platform,
    dailyBudget: number,
  ): Promise<PlatformPublishResult> {
    try {
      await this.integrations.assertConnected(platform);
      const adapter = this.registry.get(platform);
      if (dailyBudget < adapter.minDailyBudget) {
        throw new AppError(
          'BUDGET_TOO_LOW',
          `Ngân sách ${formatVnd(dailyBudget)} thấp hơn mức tối thiểu ${formatVnd(adapter.minDailyBudget)}`,
        );
      }

      const created = await adapter.createCampaign({
        name: input.name,
        objective: input.objective,
        dailyBudget,
        creative: input.creative,
      });
      const campaign = await this.campaigns.insert({
        id: randomUUID(),
        platform,
        externalId: created.externalId,
        name: input.name,
        objective: input.objective,
        platformObjective: created.platformObjective,
        status: 'PAUSED',
        dailyBudget,
        unifiedCampaignId,
        creative: input.creative,
        createdAt: new Date().toISOString(),
      });
      return { platform, success: true, campaign };
    } catch (error) {
      return { platform, success: false, error: (error as Error).message };
    }
  }
}
