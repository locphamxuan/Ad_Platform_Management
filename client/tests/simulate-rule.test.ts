import { describe, expect, it } from 'vitest';
import { matchingCampaigns, suggestRules } from '../src/features/rules/simulate-rule';
import type { Campaign, Kpis } from '../src/lib/types';

const kpis = (k: Partial<Kpis>): Kpis => ({
  spend: 0,
  impressions: 1000,
  clicks: 10,
  conversions: 0,
  revenue: 0,
  ctr: 1,
  cpc: 0,
  cpm: 0,
  cpa: 0,
  roas: 0,
  ...k,
});

const campaign = (id: string, c: Partial<Campaign>): Campaign => ({
  id,
  platform: 'facebook',
  externalId: id,
  name: id,
  objective: 'sales',
  platformObjective: 'OUTCOME_SALES',
  status: 'ACTIVE',
  dailyBudget: 500_000,
  createdAt: '2026-10-01T00:00:00Z',
  connected: true,
  kpis: kpis({}),
  ...c,
});

describe('matchingCampaigns', () => {
  const pause = {
    platform: 'all' as const,
    condition: { metric: 'cpa' as const, operator: 'gt' as const, threshold: 100_000, lookbackDays: 3 },
    action: { type: 'pause' as const },
  };

  it('acts on running campaigns that meet the condition, like the server', () => {
    const campaigns = [
      campaign('expensive', { kpis: kpis({ spend: 600_000, conversions: 2, cpa: 300_000 }) }),
      campaign('cheap', { kpis: kpis({ spend: 600_000, conversions: 10, cpa: 60_000 }) }),
      // No conversions: CPA is read as the whole spend.
      campaign('no-conv', { kpis: kpis({ spend: 200_000 }) }),
      campaign('paused', { status: 'PAUSED', kpis: kpis({ spend: 600_000, conversions: 1, cpa: 600_000 }) }),
      campaign('offline', { connected: false, kpis: kpis({ spend: 600_000, conversions: 1, cpa: 600_000 }) }),
      campaign('tiktok', { platform: 'tiktok', kpis: kpis({ spend: 600_000, conversions: 1, cpa: 600_000 }) }),
    ];
    expect(matchingCampaigns(pause, campaigns).map((c) => c.id)).toEqual(['expensive', 'no-conv', 'tiktok']);
    expect(matchingCampaigns({ ...pause, platform: 'facebook' }, campaigns).map((c) => c.id)).toEqual(['expensive', 'no-conv']);
  });

  it('looks at paused campaigns for an activate rule', () => {
    const rule = { ...pause, condition: { ...pause.condition, metric: 'roas' as const, threshold: 3 }, action: { type: 'activate' as const } };
    const campaigns = [campaign('a', { status: 'PAUSED', kpis: kpis({ roas: 4 }) }), campaign('b', { kpis: kpis({ roas: 5 }) })];
    expect(matchingCampaigns(rule, campaigns).map((c) => c.id)).toEqual(['a']);
  });
});

describe('suggestRules', () => {
  it('derives thresholds from the account', () => {
    const campaigns = [
      campaign('a', { kpis: kpis({ spend: 1e6, conversions: 10, cpa: 100_000, roas: 3, ctr: 2 }) }),
      campaign('b', { kpis: kpis({ spend: 1e6, conversions: 10, cpa: 100_000, roas: 3, ctr: 2 }) }),
    ];
    const [stopLoss, lowRoas, lowCtr, scale] = suggestRules(campaigns, true);
    expect(stopLoss.rule.condition.threshold).toBe(150_000);
    expect(lowRoas.rule.condition.threshold).toBe(1.8);
    expect(lowCtr.rule.condition.threshold).toBe(1);
    expect(scale.rule.condition.threshold).toBe(4.5);
  });

  it('leaves out budget increases for capped users and falls back without data', () => {
    const rules = suggestRules([], false);
    expect(rules).toHaveLength(3);
    expect(rules[0].rule.condition.threshold).toBe(150_000);
  });
});
