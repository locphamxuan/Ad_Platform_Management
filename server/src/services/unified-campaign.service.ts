import { randomUUID } from 'node:crypto';
import type { Campaign, Creative, Objective, Platform } from '../domain/types.js';
import { allocateBudget, type BudgetAllocationInput } from '../domain/budget.js';
import { AppError } from '../domain/errors.js';
import { formatVnd } from '../domain/format.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { AccountAdvisorService } from './account-advisor.service.js';
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
  | { platform: Platform; success: true; campaign: Campaign; account?: { id: string; name: string; reason: string } }
  | { platform: Platform; success: false; error: string };

/**
 * "Create once, run everywhere": each platform is published independently, so one
 * failing channel never blocks the others. Campaigns always start PAUSED for review,
 * each in the ad account the advisor ranks best for its objective and budget.
 */
export class UnifiedCampaignService {
  constructor(
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
    private readonly campaigns: CampaignRepository,
    private readonly activity: ActivityService,
    private readonly advisor: AccountAdvisorService,
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

      // Placement is a nicety: if it cannot be worked out, the default account takes the campaign.
      const advice = await this.advisor.advise(platform, { objective: input.objective, dailyBudget }).catch(() => null);
      const best = advice?.accounts.find((a) => a.recommended);
      const created = await adapter.createCampaign({
        name: input.name,
        objective: input.objective,
        dailyBudget,
        creative: input.creative,
        accountId: best?.id,
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
        accountId: best?.id,
        createdAt: new Date().toISOString(),
      });
      const account = best && {
        id: best.id,
        name: best.name,
        reason: advice!.accounts.length > 1 ? (best.fit.pros[0] ?? 'Điểm phù hợp cao nhất') : 'Tài khoản duy nhất của kết nối',
      };
      return { platform, success: true, campaign, account };
    } catch (error) {
      return { platform, success: false, error: (error as Error).message };
    }
  }
}
