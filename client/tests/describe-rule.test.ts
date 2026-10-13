import { describe, expect, it } from 'vitest';
import { describeRule, suggestRuleName } from '../src/features/rules/describe-rule';
import type { Rule } from '../src/lib/types';

const baseRule: Rule = {
  id: 'r1',
  name: 'Stop-loss',
  enabled: true,
  platform: 'all',
  condition: { metric: 'cpa', operator: 'gt', threshold: 150_000, lookbackDays: 3 },
  action: { type: 'pause' },
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('describeRule', () => {
  it('describes condition, action and scope', () => {
    expect(describeRule(baseRule)).toEqual({
      condition: 'CPA (đ) > 150.000 trong 3 ngày',
      action: 'Tạm dừng chiến dịch',
      scope: 'Mọi nền tảng',
    });
  });

  it('fills in the percent for budget actions and names the platform', () => {
    const rule: Rule = { ...baseRule, platform: 'tiktok', action: { type: 'increase_budget', value: 20 } };
    expect(describeRule(rule)).toMatchObject({ action: 'Tăng ngân sách 20%', scope: 'TikTok' });
  });

  it('keeps decimal thresholds instead of rounding them', () => {
    const rule: Rule = { ...baseRule, condition: { metric: 'roas', operator: 'lt', threshold: 1.5, lookbackDays: 3 } };
    expect(describeRule(rule).condition).toBe('ROAS (x) < 1,5 trong 3 ngày');
  });
});

describe('suggestRuleName', () => {
  it('names a rule after its action and condition', () => {
    expect(suggestRuleName(baseRule)).toBe('Tạm dừng chiến dịch khi CPA (đ) > 150.000 trong 3 ngày');
  });
});
