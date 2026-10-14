import { randomUUID } from 'node:crypto';
import type { Campaign, Rule } from '../domain/types.js';
import { daysAgo, today } from '../domain/dates.js';
import { formatVnd } from '../domain/format.js';
import { computeNewBudget, isConditionMet, targetStatusFor } from '../domain/rules.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { RuleRepository } from '../repositories/rule.repository.js';
import type { Actor, ActivityService } from './activity.service.js';
import type { CampaignService } from './campaign.service.js';
import type { IntegrationService } from './integration.service.js';

export type CreateRuleInput = Omit<Rule, 'id' | 'createdAt' | 'lastRunAt'>;

export interface RuleRunResult {
  ruleId: string;
  ruleName: string;
  evaluated: number;
  actions: { campaignId: string; campaignName: string; description: string }[];
  errors: string[];
}

export class RuleEngineService {
  constructor(
    private readonly rules: RuleRepository,
    private readonly campaigns: CampaignRepository,
    private readonly campaignService: CampaignService,
    private readonly integrations: IntegrationService,
    private readonly registry: PlatformRegistry,
    private readonly activity: ActivityService,
  ) {}

  list(): Promise<Rule[]> {
    return this.rules.findAll();
  }

  async create(input: CreateRuleInput, actor: Actor): Promise<Rule> {
    const rule = await this.rules.insert({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
    await this.activity.log(actor, `Tạo rule "${rule.name}"`);
    return rule;
  }

  async setEnabled(id: string, enabled: boolean, actor: Actor): Promise<Rule> {
    const rule = await this.rules.update(id, { enabled });
    await this.activity.log(actor, `${enabled ? 'Bật' : 'Tắt'} rule "${rule.name}"`);
    return rule;
  }

  async delete(id: string, actor: Actor): Promise<void> {
    const rule = await this.rules.getById(id);
    await this.rules.delete(id);
    await this.activity.log(actor, `Xoá rule "${rule.name}"`);
  }

  async runAllEnabled(): Promise<RuleRunResult[]> {
    const results: RuleRunResult[] = [];
    for (const rule of await this.rules.findEnabled()) results.push(await this.run(rule.id));
    return results;
  }

  async run(ruleId: string): Promise<RuleRunResult> {
    const rule = await this.rules.getById(ruleId);
    const actor: Actor = { type: 'rule', name: `Rule: ${rule.name}` };
    const range = { from: daysAgo(rule.condition.lookbackDays - 1), to: today() };
    const result: RuleRunResult = {
      ruleId,
      ruleName: rule.name,
      evaluated: 0,
      actions: [],
      errors: [],
    };

    for (const campaign of await this.findCandidates(rule)) {
      result.evaluated++;
      const kpis = await this.campaignService.getKpis(campaign.id, range);
      if (!isConditionMet(kpis, rule.condition)) continue;

      try {
        const description = await this.applyAction(rule, campaign, actor);
        if (description) {
          result.actions.push({ campaignId: campaign.id, campaignName: campaign.name, description });
        }
      } catch (error) {
        result.errors.push(`${campaign.name}: ${(error as Error).message}`);
      }
    }

    await this.rules.update(ruleId, { lastRunAt: new Date().toISOString() });
    return result;
  }

  private async findCandidates(rule: Rule): Promise<Campaign[]> {
    const [campaigns, connected] = await Promise.all([
      this.campaigns.findAll({
        platform: rule.platform === 'all' ? undefined : rule.platform,
        status: targetStatusFor(rule.action),
      }),
      this.integrations.connectedPlatforms(),
    ]);
    return campaigns.filter((c) => connected.has(c.platform));
  }

  private async applyAction(rule: Rule, campaign: Campaign, actor: Actor): Promise<string | null> {
    switch (rule.action.type) {
      case 'pause':
        await this.campaignService.setStatus(campaign.id, 'PAUSED', actor);
        return 'Tạm dừng';
      case 'activate': {
        const adapter = this.registry.get(campaign.platform);
        if (adapter.activationOnPlatformOnly || campaign.platform === 'facebook') {
          await this.activity.log(actor, `Bỏ qua bật chiến dịch "${campaign.name}" vì Facebook chỉ cho phép bật trên Meta Ads Manager`, campaign.id);
          return 'Bỏ qua (chỉ bật trên Meta)';
        }
        await this.campaignService.setStatus(campaign.id, 'ACTIVE', actor);
        return 'Bật lại';
      }
      case 'increase_budget':
      case 'decrease_budget': {
        const { minDailyBudget } = this.registry.get(campaign.platform);
        const nextBudget = computeNewBudget(campaign.dailyBudget, rule.action, minDailyBudget);
        if (nextBudget === campaign.dailyBudget) return null;
        await this.campaignService.setBudget(campaign.id, nextBudget, actor);
        return `Ngân sách → ${formatVnd(nextBudget)}`;
      }
    }
  }
}
