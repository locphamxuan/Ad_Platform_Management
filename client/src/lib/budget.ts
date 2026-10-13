import type { Platform } from './types';

export interface BudgetAllocation {
  platform: Platform;
  dailyBudget: number;
}

/**
 * Mirrors the server split (server/src/domain/budget.ts) so the form previews the exact amounts
 * each platform receives: rounded per channel, the remainder goes to the last one.
 */
export function allocateBudget(
  totalDailyBudget: number,
  allocations: readonly { platform: Platform; percent: number }[],
): BudgetAllocation[] {
  let allocated = 0;
  return allocations.map((a, index) => {
    const dailyBudget =
      index === allocations.length - 1 ? totalDailyBudget - allocated : Math.round((totalDailyBudget * a.percent) / 100);
    allocated += dailyBudget;
    return { platform: a.platform, dailyBudget };
  });
}
