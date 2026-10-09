import { describe, expect, it } from 'vitest';
import { allocateBudget } from '../src/domain/budget.js';
import { ValidationError } from '../src/domain/errors.js';

describe('allocateBudget', () => {
  it('splits the total budget by percent', () => {
    const result = allocateBudget(10_000_000, [
      { platform: 'facebook', percent: 40 },
      { platform: 'tiktok', percent: 30 },
      { platform: 'google', percent: 30 },
    ]);
    expect(result).toEqual([
      { platform: 'facebook', dailyBudget: 4_000_000 },
      { platform: 'tiktok', dailyBudget: 3_000_000 },
      { platform: 'google', dailyBudget: 3_000_000 },
    ]);
  });

  it('assigns the rounding remainder to the last channel so the sum is exact', () => {
    const result = allocateBudget(100_001, [
      { platform: 'facebook', percent: 33.33 },
      { platform: 'tiktok', percent: 33.33 },
      { platform: 'google', percent: 33.34 },
    ]);
    expect(result.reduce((sum, r) => sum + r.dailyBudget, 0)).toBe(100_001);
  });

  it('rejects allocations that do not sum to 100%', () => {
    expect(() =>
      allocateBudget(1_000_000, [
        { platform: 'facebook', percent: 50 },
        { platform: 'google', percent: 40 },
      ]),
    ).toThrow(ValidationError);
  });

  it('rejects duplicate platforms and empty allocations', () => {
    expect(() =>
      allocateBudget(1_000_000, [
        { platform: 'facebook', percent: 50 },
        { platform: 'facebook', percent: 50 },
      ]),
    ).toThrow(ValidationError);
    expect(() => allocateBudget(1_000_000, [])).toThrow(ValidationError);
  });
});
