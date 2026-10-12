import type { Role, WorkspaceSettings } from '../domain/types.js';
import { formatVnd } from '../domain/format.js';
import { dailyBudgetLimit } from '../domain/permissions.js';
import type { SettingsRepository } from '../repositories/settings.repository.js';
import type { Actor, ActivityService } from './activity.service.js';

export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly activity: ActivityService,
  ) {}

  get(): Promise<WorkspaceSettings> {
    return this.settings.get();
  }

  /** The effective per-campaign daily budget cap for a role right now (null = none). */
  async budgetLimitFor(role: Role): Promise<number | null> {
    return dailyBudgetLimit(role, (await this.settings.get()).buyerDailyBudgetLimit);
  }

  async setBuyerDailyBudgetLimit(limit: number | null, actor: Actor): Promise<WorkspaceSettings> {
    const current = await this.settings.get();
    if (current.buyerDailyBudgetLimit === limit) return current;

    const updated = await this.settings.save({
      ...current,
      buyerDailyBudgetLimit: limit,
      updatedAt: new Date().toISOString(),
    });
    await this.activity.log(
      actor,
      `Đổi hạn mức ngân sách Media Buyer: ${describeLimit(current.buyerDailyBudgetLimit)} → ${describeLimit(limit)}`,
    );
    return updated;
  }
}

const describeLimit = (limit: number | null) => (limit === null ? 'không giới hạn' : `${formatVnd(limit)}/ngày`);
