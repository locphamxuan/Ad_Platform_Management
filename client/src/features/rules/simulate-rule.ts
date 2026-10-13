import { formatVnd } from '../../lib/format';
import { median } from '../../lib/insights';
import type { Campaign, Kpis } from '../../lib/types';
import type { RuleDraft } from './parse-rule';

/**
 * Mirrors the server's rule engine (server/src/services/rule-engine.service.ts and
 * server/src/domain/rules.ts) so a rule can be tried before it is saved: which campaigns it would
 * act on right now, given their KPIs over the rule's own lookback window.
 */

/** CPA with zero conversions counts as the full spend, as on the server. */
function readMetric(kpis: Kpis, metric: RuleDraft['condition']['metric']): number {
  if (metric === 'cpa' && kpis.conversions === 0) return kpis.spend;
  return kpis[metric];
}

export function matchingCampaigns(rule: RuleDraft, campaigns: readonly Campaign[]): Campaign[] {
  const target = rule.action.type === 'activate' ? 'PAUSED' : 'ACTIVE';
  return campaigns.filter((c) => {
    if (!c.connected || c.status !== target) return false;
    if (rule.platform !== 'all' && c.platform !== rule.platform) return false;
    const value = readMetric(c.kpis, rule.condition.metric);
    return rule.condition.operator === 'gt' ? value > rule.condition.threshold : value < rule.condition.threshold;
  });
}

export interface SuggestedRule {
  label: string;
  why: string;
  rule: RuleDraft;
}

const roundTo = (value: number, step: number) => Math.max(step, Math.round(value / step) * step);

/**
 * Rule templates whose thresholds come from this account's own numbers instead of fixed
 * guesses: stop-loss at 1.5× the typical CPA, scale-up at 1.5× the typical ROAS, and so on.
 */
export function suggestRules(campaigns: readonly Campaign[], allowIncrease: boolean): SuggestedRule[] {
  const withSpend = campaigns.filter((c) => c.kpis.spend > 0);
  const cpa = median(withSpend.filter((c) => c.kpis.conversions > 0).map((c) => c.kpis.cpa));
  const roas = median(withSpend.map((c) => c.kpis.roas));
  const ctr = median(withSpend.map((c) => c.kpis.ctr));

  const stopLoss = cpa > 0 ? roundTo(cpa * 1.5, 1000) : 150_000;
  const lowRoas = roas > 0 ? Math.max(1, Math.round(roas * 0.6 * 10) / 10) : 1.5;
  const highRoas = roas > 0 ? Math.round(roas * 1.5 * 10) / 10 : 4;
  const lowCtr = ctr > 0 ? Math.round(ctr * 0.5 * 100) / 100 : 0.5;
  const basis = withSpend.length > 0 ? 'theo số liệu tài khoản' : 'mức mặc định (chưa có số liệu)';

  const list: SuggestedRule[] = [
    {
      label: 'Cắt lỗ khi CPA cao',
      why: cpa > 0 ? `1,5 lần CPA điển hình ${formatVnd(cpa)}, ${basis}` : `Mức mặc định (chưa có số liệu)`,
      rule: { platform: 'all', condition: { metric: 'cpa', operator: 'gt', threshold: stopLoss, lookbackDays: 3 }, action: { type: 'pause' } },
    },
    {
      label: 'Giảm ngân sách khi ROAS thấp',
      why: `Dưới 60% ROAS điển hình, ${basis}`,
      rule: {
        platform: 'all',
        condition: { metric: 'roas', operator: 'lt', threshold: lowRoas, lookbackDays: 3 },
        action: { type: 'decrease_budget', value: 20 },
      },
    },
    {
      label: 'Dừng khi CTR thấp',
      why: `Dưới một nửa CTR điển hình, ${basis}`,
      rule: { platform: 'all', condition: { metric: 'ctr', operator: 'lt', threshold: lowCtr, lookbackDays: 7 }, action: { type: 'pause' } },
    },
  ];
  if (allowIncrease) {
    list.push({
      label: 'Tăng ngân sách khi ROAS tốt',
      why: `Trên 1,5 lần ROAS điển hình, ${basis}`,
      rule: {
        platform: 'all',
        condition: { metric: 'roas', operator: 'gt', threshold: highRoas, lookbackDays: 7 },
        action: { type: 'increase_budget', value: 20 },
      },
    });
  }
  return list;
}
