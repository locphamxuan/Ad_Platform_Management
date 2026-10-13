import { describe, expect, it } from 'vitest';
import { parseRule } from '../src/features/rules/parse-rule';

describe('parseRule', () => {
  it('reads a stop-loss rule', () => {
    const { rule, missing } = parseRule('Tạm dừng khi CPA > 150k trong 3 ngày');
    expect(rule).toEqual({
      platform: 'all',
      condition: { metric: 'cpa', operator: 'gt', threshold: 150_000, lookbackDays: 3 },
      action: { type: 'pause' },
    });
    expect(missing).toEqual([]);
  });

  it('reads a budget increase without accents, with a platform', () => {
    const { rule } = parseRule('tang ngan sach 30% neu roas tren 4 trong 7 ngay o facebook');
    expect(rule).toEqual({
      platform: 'facebook',
      condition: { metric: 'roas', operator: 'gt', threshold: 4, lookbackDays: 7 },
      action: { type: 'increase_budget', value: 30 },
    });
  });

  it('reads "below" and decimal commas', () => {
    const { rule } = parseRule('Giảm ngân sách 20% khi ROAS dưới 1,5 trong 1 tuần');
    expect(rule.condition).toEqual({ metric: 'roas', operator: 'lt', threshold: 1.5, lookbackDays: 7 });
    expect(rule.action).toEqual({ type: 'decrease_budget', value: 20 });
  });

  it('does not read "áp dụng" as pause', () => {
    const { rule, missing } = parseRule('Áp dụng bật lại chiến dịch khi CTR lớn hơn 2 trên TikTok');
    expect(rule.action.type).toBe('activate');
    expect(rule.platform).toBe('tiktok');
    expect(rule.condition).toMatchObject({ metric: 'ctr', operator: 'gt', threshold: 2 });
    expect(missing).toContain('khoảng thời gian');
  });

  it('caps a budget change at 50% and snaps the lookback', () => {
    const { rule } = parseRule('giảm ngân sách 80% khi chi tiêu vượt 2 triệu trong 5 ngày');
    expect(rule.action).toEqual({ type: 'decrease_budget', value: 50 });
    expect(rule.condition).toEqual({ metric: 'spend', operator: 'gt', threshold: 2_000_000, lookbackDays: 3 });
  });

  it('lists what it had to guess', () => {
    expect(parseRule('làm gì đó').missing).toEqual(['chỉ số', 'hành động', 'khoảng thời gian', 'ngưỡng']);
  });
});
