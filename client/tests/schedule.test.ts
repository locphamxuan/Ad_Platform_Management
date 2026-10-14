import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  describeSchedule,
  estimateCampaignDurationDays,
  estimateCostVnd,
} from '../src/lib/schedule';

describe('schedule utils', () => {
  it('formatDateTime formats date into human readable Vietnamese with UTC+7 timezone', () => {
    const formatted = formatDateTime('2026-10-15T12:00:00Z');
    expect(formatted).toContain('19:00'); // 12:00 UTC + 7 = 19:00
    expect(formatted).toContain('15/10/2026');
  });

  it('describeSchedule handles continuous schedule', () => {
    expect(describeSchedule(undefined)).toBe('Chạy liên tục không thời hạn (từ khi tạo)');
    expect(describeSchedule({})).toBe('Chạy liên tục không thời hạn (từ khi tạo)');
    expect(describeSchedule({ startTime: '2026-10-15T00:00:00Z' })).toContain('liên tục');
  });

  it('describeSchedule handles date range', () => {
    const desc = describeSchedule({
      startTime: '2026-10-15T00:00:00Z',
      endTime: '2026-10-25T00:00:00Z',
    });
    expect(desc).toContain('đến');
    expect(desc).toContain('15/10/2026');
    expect(desc).toContain('25/10/2026');
  });

  it('estimateCampaignDurationDays calculates days between dates', () => {
    expect(estimateCampaignDurationDays(undefined)).toBeNull();
    expect(estimateCampaignDurationDays({ startTime: '2026-10-01T00:00:00Z' })).toBeNull();

    const days = estimateCampaignDurationDays({
      startTime: '2026-10-01T00:00:00Z',
      endTime: '2026-10-11T00:00:00Z',
    });
    expect(days).toBe(10);
  });

  it('estimateCostVnd estimates budget accurately', () => {
    // 500k/day for 10 days = 5M
    const costRange = estimateCostVnd(500_000, {
      startTime: '2026-10-01T00:00:00Z',
      endTime: '2026-10-11T00:00:00Z',
    });
    expect(costRange.totalVnd).toBe(5_000_000);
    expect(costRange.days).toBe(10);
    expect(costRange.isUnlimited).toBe(false);

    // Continuous defaults to 30 days
    const costContinuous = estimateCostVnd(500_000, {});
    expect(costContinuous.totalVnd).toBe(15_000_000);
    expect(costContinuous.days).toBe(30);
    expect(costContinuous.isUnlimited).toBe(true);
  });
});
