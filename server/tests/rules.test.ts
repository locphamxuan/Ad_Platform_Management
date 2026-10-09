import { describe, expect, it } from 'vitest';
import { toKpis } from '../src/domain/metrics.js';
import { computeNewBudget, isConditionMet, SAFETY_LIMITS, targetStatusFor } from '../src/domain/rules.js';

const kpis = (spend: number, conversions: number, revenue = 0) =>
  toKpis({ spend, impressions: 10_000, clicks: 200, conversions, revenue });

describe('isConditionMet', () => {
  it('compares CPA against the threshold', () => {
    const condition = { metric: 'cpa', operator: 'gt', threshold: 100_000, lookbackDays: 3 } as const;
    expect(isConditionMet(kpis(1_000_000, 5), condition)).toBe(true); // CPA 200k
    expect(isConditionMet(kpis(1_000_000, 20), condition)).toBe(false); // CPA 50k
  });

  it('treats spend without conversions as CPA = spend', () => {
    const condition = { metric: 'cpa', operator: 'gt', threshold: 100_000, lookbackDays: 3 } as const;
    expect(isConditionMet(kpis(500_000, 0), condition)).toBe(true);
  });

  it('supports less-than comparisons on ROAS', () => {
    const condition = { metric: 'roas', operator: 'lt', threshold: 2, lookbackDays: 7 } as const;
    expect(isConditionMet(kpis(1_000_000, 10, 1_500_000), condition)).toBe(true);
    expect(isConditionMet(kpis(1_000_000, 10, 3_000_000), condition)).toBe(false);
  });
});

describe('computeNewBudget', () => {
  it('increases and decreases by percent', () => {
    expect(computeNewBudget(1_000_000, { type: 'increase_budget', value: 20 }, 20_000)).toBe(1_200_000);
    expect(computeNewBudget(1_000_000, { type: 'decrease_budget', value: 20 }, 20_000)).toBe(800_000);
  });

  it('caps a single change at the safety limit', () => {
    const next = computeNewBudget(1_000_000, { type: 'increase_budget', value: 100 }, 20_000);
    expect(next).toBe(1_000_000 * (1 + SAFETY_LIMITS.maxBudgetChangePercent / 100));
  });

  it('never goes below the platform minimum or above the hard cap', () => {
    expect(computeNewBudget(30_000, { type: 'decrease_budget', value: 50 }, 25_000)).toBe(25_000);
    expect(computeNewBudget(45_000_000, { type: 'increase_budget', value: 50 }, 25_000)).toBe(
      SAFETY_LIMITS.maxDailyBudget,
    );
  });
});

describe('targetStatusFor', () => {
  it('activate targets paused campaigns, everything else targets active ones', () => {
    expect(targetStatusFor({ type: 'activate' })).toBe('PAUSED');
    expect(targetStatusFor({ type: 'pause' })).toBe('ACTIVE');
  });
});
