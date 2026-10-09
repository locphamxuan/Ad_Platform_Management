import { ValidationError } from './errors.js';
import type { Platform } from './types.js';

export interface BudgetAllocationInput {
  platform: Platform;
  percent: number;
}

export interface BudgetAllocation {
  platform: Platform;
  dailyBudget: number;
}

const TOTAL_PERCENT = 100;

/** Splits a total daily budget by percentage; rounding remainder goes to the last channel. */
export function allocateBudget(
  totalDailyBudget: number,
  allocations: readonly BudgetAllocationInput[],
): BudgetAllocation[] {
  if (allocations.length === 0) throw new ValidationError('Select at least one platform');
  if (totalDailyBudget <= 0) throw new ValidationError('Total budget must be positive');

  const platforms = new Set(allocations.map((a) => a.platform));
  if (platforms.size !== allocations.length) throw new ValidationError('Duplicate platform');

  const percentSum = allocations.reduce((sum, a) => sum + a.percent, 0);
  if (Math.abs(percentSum - TOTAL_PERCENT) > 0.001) {
    throw new ValidationError(`Allocation must sum to 100% (got ${percentSum}%)`);
  }

  let allocated = 0;
  return allocations.map((a, index) => {
    const isLast = index === allocations.length - 1;
    const dailyBudget = isLast
      ? totalDailyBudget - allocated
      : Math.round((totalDailyBudget * a.percent) / TOTAL_PERCENT);
    allocated += dailyBudget;
    return { platform: a.platform, dailyBudget };
  });
}
