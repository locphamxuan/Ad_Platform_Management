import { describe, expect, it } from 'vitest';
import { allocateBudget } from '../src/lib/budget';

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
