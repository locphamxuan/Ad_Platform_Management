import { describe, expect, it } from 'vitest';
import { brandFrom, placementsFor } from '../src/components/AdPreview';
import { bestDay, ctaAdvice, describeAdvice, describeOtherPlatform, summarizeCampaign } from '../src/features/campaigns/campaign-insights';
import type { AdAccountOption, CampaignDetail, DailyPoint, Kpis } from '../src/lib/types';

const kpis = (spend: number, revenue: number, conversions: number): Kpis => ({
  spend,
  revenue,
  conversions,
  impressions: spend / 40,
  clicks: spend / 2_000,
  ctr: 5,
  cpc: 2_000,
  cpm: 40_000,
  cpa: conversions ? spend / conversions : 0,
  roas: spend ? revenue / spend : 0,
});

const day = (date: string, spend: number, revenue: number, conversions = 1): DailyPoint => ({
  date,
  spend,
  revenue,
  conversions,
  impressions: 0,
  clicks: 0,
});

const detail = (current: Kpis, previous: Kpis, daily: DailyPoint[] = []): CampaignDetail => ({
  campaign: {
    id: 'c1',
    platform: 'facebook',
    externalId: 'fb-1',
    name: 'Chiến dịch',
    objective: 'sales',
    platformObjective: 'OUTCOME_SALES',
    status: 'ACTIVE',
    dailyBudget: 1_000_000,
    createdAt: '2026-10-01T00:00:00Z',
    connected: true,
    kpis: current,
  },
  previousKpis: previous,
  daily,
  advice: { accounts: [], recommendedId: null, lookbackDays: 30 },
  accountCounts: [],
  siblings: [],
});

const option = (id: string, changes: Partial<AdAccountOption> = {}): AdAccountOption => ({
  id,
  name: id,
  platform: 'facebook',
  active: true,
  spendCap: null,
  amountSpent: null,
  primary: false,
  campaigns: 0,
  activeCampaigns: 0,
  kpis: kpis(0, 0, 0),
  fit: { accountId: id, score: 60, eligible: true, runwayDays: null, breakdown: { performance: 25, runway: 25, focus: 10, maturity: 0 }, pros: [], cons: [] },
  current: false,
  recommended: false,
  ...changes,
});

describe('summarizeCampaign', () => {
  it('praises a campaign with a strong return and compares it with the previous period', () => {
    const summary = summarizeCampaign(
      detail(kpis(7_000_000, 35_000_000, 70), kpis(7_000_000, 21_000_000, 50), [day('2026-10-12', 1_000_000, 8_000_000), day('2026-10-13', 1_000_000, 3_000_000)]),
      150_000,
    );
    expect(summary.headline).toMatch(/hiệu quả — ROAS 5x/);
    expect(summary.points.join(' ')).toMatch(/ROAS tăng 66,67%/);
    expect(summary.points.join(' ')).toMatch(/CPA thấp hơn/);
    expect(summary.points.at(-1)).toBe('Ngày hiệu quả nhất: 12/10 với ROAS 8x.');
  });

  it('says so when the campaign did not deliver', () => {
    expect(summarizeCampaign(detail(kpis(0, 0, 0), kpis(0, 0, 0)), 0).headline).toMatch(/chưa phân phối/);
  });
});

describe('bestDay', () => {
  it('needs at least two days with spend', () => {
    expect(bestDay([day('2026-10-13', 100, 500)])).toBeNull();
  });
});

describe('describeAdvice', () => {
  it('recommends moving only when another account fits better', () => {
    const here = option('a', { current: true, fit: { ...option('a').fit, score: 48 } });
    const better = option('b', { name: 'Tài khoản mở rộng', recommended: true, fit: { ...option('b').fit, score: 81 } });
    expect(describeAdvice([better, here])).toEqual({
      tone: 'ai',
      text: 'Nên chạy trên "Tài khoản mở rộng" — điểm phù hợp 81/100 so với 48 của tài khoản hiện tại.',
    });
    expect(describeAdvice([{ ...here, recommended: true }])?.tone).toBe('positive');
    expect(describeAdvice([])).toBeNull();
  });

  it('frames another platform as an expansion, not a move', () => {
    const best = option('t1', { name: 'TikTok chính', recommended: true, fit: { ...option('t1').fit, score: 70 } });
    expect(describeOtherPlatform([best, option('t2')], 'TikTok')?.text).toBe(
      'Nếu mở rộng sang TikTok, nên dùng "TikTok chính" — điểm phù hợp 70/100 trong 2 tài khoản.',
    );
  });
});

describe('ad preview helpers', () => {
  it('derives the advertiser from the landing page', () => {
    expect(brandFrom('https://www.shop-abc.vn/khuyen-mai/thang-10?utm_source=fb')).toEqual({
      domain: 'shop-abc.vn',
      name: 'Shop-abc',
      path: 'khuyen-mai › thang-10',
    });
    expect(brandFrom('https://').name).toBe('Thương hiệu của bạn');
  });

  it('offers the placements of the chosen platforms only', () => {
    expect(placementsFor(['tiktok']).map((p) => p.id)).toEqual(['tiktok']);
    expect(placementsFor(['facebook', 'google'])).toHaveLength(5);
  });

  it('matches the call-to-action to the objective', () => {
    expect(ctaAdvice('leads').label).toBe('Đăng ký');
  });
});
