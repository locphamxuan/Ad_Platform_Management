import { describe, expect, it } from 'vitest';
import { suggestCampaign, TEMPLATES } from '../src/features/create-campaign/autofill';
import { allocateBudget, splitEvenly } from '../src/lib/budget';
import type { Platform } from '../src/lib/types';

const ALL: Platform[] = ['facebook', 'tiktok', 'google'];
const MIN = new Map<Platform, number>([
  ['facebook', 25_000],
  ['tiktok', 50_000],
  ['google', 20_000],
]);
const now = new Date(2026, 9, 13);

const perChannel = (total: number, platforms: Platform[]) => {
  const shares = splitEvenly(platforms);
  return allocateBudget(total, platforms.map((platform) => ({ platform, percent: shares[platform] ?? 0 })));
};

describe('suggestCampaign', () => {
  it('fills every field with values the server accepts', () => {
    for (let index = 0; index < TEMPLATES.length; index++) {
      const draft = suggestCampaign({ index, now, platforms: ALL, minBudget: MIN, limit: null });
      expect(draft.name.length).toBeGreaterThanOrEqual(3);
      expect(draft.name).not.toContain('{month}');
      expect(draft.creative.headline.length).toBeLessThanOrEqual(100);
      expect(draft.creative.primaryText.length).toBeLessThanOrEqual(500);
      expect(() => new URL(draft.creative.landingUrl)).not.toThrow();
      expect(draft.totalDailyBudget % 1000).toBe(0);
    }
  });

  it('moves to another template on each click and wraps around', () => {
    const first = suggestCampaign({ index: 0, now, platforms: ALL, minBudget: MIN, limit: null });
    const second = suggestCampaign({ index: 1, now, platforms: ALL, minBudget: MIN, limit: null });
    const wrapped = suggestCampaign({ index: TEMPLATES.length, now, platforms: ALL, minBudget: MIN, limit: null });
    expect(second.name).not.toBe(first.name);
    expect(wrapped).toEqual(first);
  });

  it('puts the month or date in the name and a UTM tag in the link', () => {
    const draft = suggestCampaign({ index: 1, now, platforms: ALL, minBudget: MIN, limit: null });
    expect(draft.name).toContain('10/2026');
    expect(new URL(draft.creative.landingUrl).searchParams.get('utm_source')).toBe('adhub');
  });

  it('keeps every channel above its minimum and within the buyer cap', () => {
    const limit = 400_000;
    for (let index = 0; index < TEMPLATES.length; index++) {
      const { totalDailyBudget } = suggestCampaign({ index, now, platforms: ALL, minBudget: MIN, limit });
      for (const { platform, dailyBudget } of perChannel(totalDailyBudget, ALL)) {
        expect(dailyBudget).toBeGreaterThanOrEqual(MIN.get(platform)!);
        expect(dailyBudget).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('falls back below every preset when the cap is very tight', () => {
    const { totalDailyBudget } = suggestCampaign({ index: 0, now, platforms: ALL, minBudget: MIN, limit: 100_000 });
    expect(Math.max(...perChannel(totalDailyBudget, ALL).map((a) => a.dailyBudget))).toBeLessThanOrEqual(100_000);
    expect(totalDailyBudget).toBeGreaterThan(200_000);
  });
});
