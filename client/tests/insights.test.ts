import { describe, expect, it } from 'vitest';
import {
  briefing,
  campaignHealth,
  detectSpendAnomaly,
  percentChange,
  projectMonthlySpend,
  recommend,
  suggestAllocation,
} from '../src/lib/insights';
import { previousRange } from '../src/lib/format';
import type { Campaign, DashboardSummary, Kpis, Platform } from '../src/lib/types';

const kpis = (k: Partial<Kpis>): Kpis => {
  const base = { spend: 0, impressions: 10_000, clicks: 200, conversions: 0, revenue: 0, ...k };
  return {
    ...base,
    ctr: (base.clicks / base.impressions) * 100,
    cpc: base.clicks ? base.spend / base.clicks : 0,
    cpm: (base.spend / base.impressions) * 1000,
    cpa: base.conversions ? base.spend / base.conversions : 0,
    roas: base.spend ? base.revenue / base.spend : 0,
  };
};

let seq = 0;
const campaign = (c: Partial<Campaign> & { kpis: Kpis }): Campaign => ({
  id: `c${++seq}`,
  platform: 'facebook',
  externalId: 'x',
  name: `Campaign ${seq}`,
  objective: 'sales',
  platformObjective: 'OUTCOME_SALES',
  status: 'ACTIVE',
  dailyBudget: 1_000_000,
  createdAt: '2026-10-01T00:00:00Z',
  connected: true,
  ...c,
});

describe('percentChange', () => {
  it('handles zero baselines', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe('campaignHealth', () => {
  it('rates strong campaigns high and unconverting ones low', () => {
    expect(campaignHealth(kpis({ spend: 1e6, revenue: 5e6, conversions: 20 }), 50_000).score).toBeGreaterThanOrEqual(70);
    expect(campaignHealth(kpis({ spend: 1e6, revenue: 0, conversions: 0, clicks: 10 }), 50_000).label).toBe('Cần xem');
    expect(campaignHealth(kpis({ spend: 0 }), 50_000).label).toBe('Chưa đủ dữ liệu');
  });
});

describe('recommend', () => {
  it('pauses waste first, then trims, then scales, and skips young or disconnected campaigns', () => {
    const waste = campaign({ kpis: kpis({ spend: 3e6, conversions: 0 }) });
    const loss = campaign({ kpis: kpis({ spend: 2e6, revenue: 1e6, conversions: 10 }) });
    const weak = campaign({ kpis: kpis({ spend: 2e6, revenue: 3e6, conversions: 20 }) });
    const star = campaign({ kpis: kpis({ spend: 2e6, revenue: 1e7, conversions: 40 }) });
    const fine = campaign({ kpis: kpis({ spend: 2e6, revenue: 6e6, conversions: 30 }) });
    const young = campaign({ kpis: kpis({ spend: 100_000, conversions: 0 }) });
    const offline = campaign({ connected: false, kpis: kpis({ spend: 3e6, conversions: 0 }) });
    const sleeper = campaign({ status: 'PAUSED', kpis: kpis({ spend: 1e6, revenue: 4e6, conversions: 10 }) });

    const recs = recommend([star, weak, waste, loss, fine, young, offline, sleeper]);
    const byId = new Map(recs.map((r) => [r.campaignId, r]));
    expect(recs.map((r) => r.severity)).toEqual(['high', 'high', 'medium', 'low', 'low']);
    expect(byId.get(waste.id)?.action).toEqual({ kind: 'status', status: 'PAUSED' });
    expect(byId.get(loss.id)?.action).toEqual({ kind: 'status', status: 'PAUSED' });
    expect(byId.get(weak.id)?.action).toEqual({ kind: 'budget', dailyBudget: 800_000 });
    expect(byId.get(star.id)?.action).toEqual({ kind: 'budget', dailyBudget: 1_200_000 });
    expect(byId.get(sleeper.id)?.action).toEqual({ kind: 'status', status: 'ACTIVE' });
    expect(byId.has(fine.id) || byId.has(young.id) || byId.has(offline.id)).toBe(false);
  });

  it('respects the platform minimum and the user cap', () => {
    const weak = campaign({ dailyBudget: 100_000, kpis: kpis({ spend: 500_000, revenue: 700_000, conversions: 5 }) });
    const star = campaign({ kpis: kpis({ spend: 2e6, revenue: 1e7, conversions: 40 }) });
    const recs = recommend([weak, star], { minBudget: new Map([['facebook', 100_000]]), limit: 1_000_000 });
    expect(recs).toEqual([]);
  });
});

const day = (date: string, facebook: number, google = 0) => ({ date, facebook, google });

describe('spend trends', () => {
  const steady = [day('2026-10-01', 100), day('2026-10-02', 110), day('2026-10-03', 90), day('2026-10-04', 100)];

  it('flags a spike or a drop on the latest day only', () => {
    expect(detectSpendAnomaly(steady)).toBeNull();
    expect(detectSpendAnomaly([...steady, day('2026-10-05', 150, 100)])).toMatchObject({ direction: 'spike', value: 250 });
    expect(detectSpendAnomaly([...steady, day('2026-10-05', 30)])).toMatchObject({ direction: 'drop' });
  });

  it('projects a month at the average pace', () => {
    expect(projectMonthlySpend(steady, new Date(2026, 9, 13))).toBe(100 * 31);
  });
});

describe('suggestAllocation', () => {
  it('weights by ROAS, keeps a floor and sums to 100', () => {
    const roas = new Map<Platform, number>([
      ['facebook', 4],
      ['tiktok', 1],
      ['google', 3],
    ]);
    const shares = suggestAllocation(['facebook', 'tiktok', 'google'], roas);
    expect(Object.values(shares).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
    expect(shares.facebook).toBeGreaterThan(shares.google!);
    expect(shares.tiktok).toBeGreaterThanOrEqual(15);
    expect(suggestAllocation(['google'], roas)).toEqual({ google: 100 });
  });

  it('gives platforms without data the average weight', () => {
    const shares = suggestAllocation(['facebook', 'tiktok'], new Map([['facebook', 2]]));
    expect(shares).toEqual({ facebook: 50, tiktok: 50 });
  });
});

describe('briefing', () => {
  const summary = (spend: number, revenue: number): DashboardSummary => ({
    range: { from: '2026-10-07', to: '2026-10-13' },
    totals: kpis({ spend, revenue, conversions: 10 }),
    byPlatform: [
      { platform: 'facebook', displayName: 'Facebook', activeCampaigns: 1, totalCampaigns: 1, kpis: kpis({ spend, revenue: revenue * 1.5 }) },
      { platform: 'tiktok', displayName: 'TikTok', activeCampaigns: 1, totalCampaigns: 1, kpis: kpis({ spend, revenue: revenue / 2 }) },
    ],
    dailySpend: [],
  });

  it('compares with the previous period and names the best and worst platform', () => {
    const result = briefing(summary(2e6, 6e6), summary(1e6, 3e6));
    expect(result.headline).toContain('ổn định');
    expect(result.points[0]).toContain('tăng 100%');
    expect(result.points[2]).toMatch(/^Facebook dẫn đầu/);
    expect(result.points[3]).toContain('từ TikTok sang Facebook');
  });
});

describe('previousRange', () => {
  it('returns the same-length period just before', () => {
    expect(previousRange({ from: '2026-10-07', to: '2026-10-13' })).toEqual({ from: '2026-09-30', to: '2026-10-06' });
  });
});
