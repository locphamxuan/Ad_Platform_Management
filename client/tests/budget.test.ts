import { describe, expect, it } from 'vitest';
import { allocateBudget, rebalance, splitEvenly } from '../src/lib/budget';

const total = (percents: Partial<Record<string, number>>) =>
  Object.values(percents).reduce<number>((sum, p) => sum + (p ?? 0), 0);

describe('splitEvenly', () => {
  it('uses whole percentages that add up to 100', () => {
    expect(splitEvenly(['facebook', 'tiktok', 'google'])).toEqual({ facebook: 34, tiktok: 33, google: 33 });
    expect(splitEvenly(['facebook', 'google'])).toEqual({ facebook: 50, google: 50 });
    expect(splitEvenly(['tiktok'])).toEqual({ tiktok: 100 });
  });
});

describe('rebalance', () => {
  it('spreads the rest over the other platforms in proportion and keeps the total at 100', () => {
    const result = rebalance({ facebook: 40, tiktok: 30, google: 30 }, 'facebook', 60);
    expect(result).toEqual({ facebook: 60, tiktok: 20, google: 20 });
    expect(total(result)).toBe(100);
  });

  it('splits evenly when the others were all 0', () => {
    expect(rebalance({ facebook: 100, tiktok: 0, google: 0 }, 'facebook', 50)).toEqual({ facebook: 50, tiktok: 25, google: 25 });
  });

  it('clamps out-of-range input and pins a single platform to 100', () => {
    expect(rebalance({ facebook: 50, tiktok: 50 }, 'tiktok', 130)).toEqual({ facebook: 0, tiktok: 100 });
    expect(rebalance({ google: 100 }, 'google', 40)).toEqual({ google: 100 });
  });

  it('never drifts from 100 with awkward ratios', () => {
    expect(total(rebalance({ facebook: 33, tiktok: 33, google: 34 }, 'tiktok', 17))).toBe(100);
  });
});

describe('allocateBudget', () => {
  it('splits by percent and gives the rounding remainder to the last platform', () => {
    expect(
      allocateBudget(1_000_001, [
        { platform: 'facebook', percent: 40 },
        { platform: 'tiktok', percent: 30 },
        { platform: 'google', percent: 30 },
      ]),
    ).toEqual([
      { platform: 'facebook', dailyBudget: 400_000 },
      { platform: 'tiktok', dailyBudget: 300_000 },
      { platform: 'google', dailyBudget: 300_001 },
    ]);
  });

  it('always adds up to the total', () => {
    const parts = allocateBudget(100_000, [
      { platform: 'facebook', percent: 33 },
      { platform: 'tiktok', percent: 67 },
    ]);
    expect(parts.reduce((sum, p) => sum + p.dailyBudget, 0)).toBe(100_000);
  });
});
