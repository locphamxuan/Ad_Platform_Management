import type { Kpis } from './metrics.js';
import type { CampaignStatus, Rule, RuleMetric } from './types.js';

export const SAFETY_LIMITS = {
  /** A single rule run never changes a budget by more than this percent */
  maxBudgetChangePercent: 50,
  /** Hard cap for any daily budget set by automation, in VND */
  maxDailyBudget: 50_000_000,
} as const;

/**
 * CPA with zero conversions is treated as the full spend: spending without
 * converting must still be able to trigger a stop-loss rule.
 */
function readMetric(kpis: Kpis, metric: RuleMetric): number {
  if (metric === 'cpa' && kpis.conversions === 0) return kpis.spend;
  return kpis[metric];
}

export function isConditionMet(kpis: Kpis, condition: Rule['condition']): boolean {
  const value = readMetric(kpis, condition.metric);
  return condition.operator === 'gt' ? value > condition.threshold : value < condition.threshold;
}

/** Which campaign status a rule action can act upon. */
export function targetStatusFor(action: Rule['action']): CampaignStatus {
  return action.type === 'activate' ? 'PAUSED' : 'ACTIVE';
}

export function computeNewBudget(
  currentBudget: number,
  action: Rule['action'],
  minDailyBudget: number,
): number {
  const percent = Math.min(action.value ?? 0, SAFETY_LIMITS.maxBudgetChangePercent);
  const direction = action.type === 'increase_budget' ? 1 : -1;
  const next = Math.round(currentBudget * (1 + (direction * percent) / 100));
  return Math.min(Math.max(next, minDailyBudget), SAFETY_LIMITS.maxDailyBudget);
}
