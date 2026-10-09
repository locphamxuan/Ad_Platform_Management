import { describe, expect, it } from 'vitest';
import { describeRule } from '../src/features/rules/describe-rule';
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
});
