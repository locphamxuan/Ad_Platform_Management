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

/** Whole percentages that add up to exactly 100; the first platforms absorb the remainder (34/33/33). */
export function splitEvenly(platforms: readonly Platform[]): Partial<Record<Platform, number>> {
  const base = Math.floor(100 / Math.max(platforms.length, 1));
  const extra = 100 - base * platforms.length;
  return Object.fromEntries(platforms.map((p, index) => [p, base + (index < extra ? 1 : 0)]));
}

/**
 * Sets one platform's share and spreads what is left over the others in proportion to their current
 * shares (evenly when they are all 0), so the total always stays at 100 without manual arithmetic.
 */
export function rebalance(
  percents: Partial<Record<Platform, number>>,
  platform: Platform,
  percent: number,
): Partial<Record<Platform, number>> {
  const others = (Object.keys(percents) as Platform[]).filter((p) => p !== platform);
  const fixed = others.length === 0 ? 100 : Math.min(100, Math.max(0, Math.round(percent)));
  const remaining = 100 - fixed;
  const otherTotal = others.reduce((sum, p) => sum + (percents[p] ?? 0), 0);

  const result: Partial<Record<Platform, number>> = { ...percents, [platform]: fixed };
  let given = 0;
  others.forEach((p, index) => {
    const share =
      index === others.length - 1
        ? remaining - given
        : Math.round(otherTotal > 0 ? (remaining * (percents[p] ?? 0)) / otherTotal : remaining / others.length);
    result[p] = share;
    given += share;
  });
  return result;
}
