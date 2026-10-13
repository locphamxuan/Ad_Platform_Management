import { AMOUNT_PATTERN, fold, readAmount } from '../../lib/text';
import type { NewRule, RuleActionType, RuleMetric, RuleOperator } from '../../lib/types';

export type RuleDraft = Omit<NewRule, 'name' | 'enabled'>;

export interface ParsedRule {
  rule: RuleDraft;
  /** Parts the sentence did not state; the defaults below were used for them */
  missing: string[];
}

export const LOOKBACK_OPTIONS = [1, 3, 7, 14] as const;
const DEFAULT_LOOKBACK = 3;
const DEFAULT_CHANGE = 20;

const METRICS: [RuleMetric, RegExp][] = [
  ['roas', /\broas\b/],
  ['ctr', /\bctr\b|ty le (click|nhap)|ti le (click|nhap)/],
  ['cpa', /\bcpa\b|chi phi (moi |tren |\/)?(chuyen doi|don|khach)/],
  ['spend', /chi tieu|\bspend\b|tieu (het|qua|tren)/],
];

const ACTIONS: [RuleActionType, RegExp][] = [
  ['activate', /bat lai|kich hoat|mo lai|chay lai|\bactivate\b|\bresume\b/],
  ['increase_budget', /tang (ngan sach|ns|budget)|\bscale\b|day (ngan sach|ns)/],
  ['decrease_budget', /giam (ngan sach|ns|budget)|ha (ngan sach|ns)/],
  ['pause', /tam dung|tam ngung|\bdung\b|\bngung\b|\btat\b|\bpause\b|\bstop\b/],
];

const OPERATORS: [RuleOperator, RegExp][] = [
  ['gt', />|lon hon|cao hon|vuot|\btren\b|\bqua\b|\bhon\b/],
  ['lt', /<|nho hon|thap hon|\bduoi\b|kem hon|\bchua toi\b/],
];

const PLATFORMS: [NewRule['platform'], RegExp][] = [
  ['facebook', /facebook|\bfb\b|\bmeta\b/],
  ['tiktok', /tik ?tok/],
  ['google', /google|\bgg\b|adwords/],
];

/**
 * Reads a one-line rule such as "Tạm dừng khi CPA > 150k trong 3 ngày" or
 * "tang ngan sach 20% neu roas tren 4 trong 7 ngay o facebook". Accents are optional.
 */
export function parseRule(sentence: string): ParsedRule {
  // "áp dụng" (apply) contains "dụng"; drop it so it is not read as "dừng" (pause).
  const text = fold(sentence).replace(/ap dung/g, '      ');
  const missing: string[] = [];

  const metricHit = METRICS.map(([metric, re]) => ({ metric, index: text.search(re) })).filter((m) => m.index !== -1);
  metricHit.sort((a, b) => a.index - b.index);
  const metric = metricHit[0]?.metric ?? 'cpa';
  if (!metricHit.length) missing.push('chỉ số');

  const action = ACTIONS.find(([, re]) => re.test(text))?.[0] ?? 'pause';
  if (!ACTIONS.some(([, re]) => re.test(text))) missing.push('hành động');

  let rest = text;
  const cut = (re: RegExp) => {
    const match = re.exec(rest);
    if (match) rest = rest.slice(0, match.index) + ' '.repeat(match[0].length) + rest.slice(match.index + match[0].length);
    return match;
  };

  const changeMatch = cut(/(tang|giam|ha|day)\s+(ngan sach|ns|budget)\s*(them\s*)?(\d{1,3})\s*%/);
  const change = changeMatch ? Math.min(50, Math.max(1, Number(changeMatch[4]))) : DEFAULT_CHANGE;

  const lookbackMatch = cut(/(\d{1,2})\s*ngay/);
  const weekly = cut(/\b(1\s*)?tuan\b/);
  const lookbackDays = lookbackMatch
    ? nearestLookback(Number(lookbackMatch[1]))
    : weekly
      ? 7
      : /hom qua|hom nay/.test(text)
        ? 1
        : DEFAULT_LOOKBACK;
  if (!lookbackMatch && !weekly && !/hom qua|hom nay/.test(text)) missing.push('khoảng thời gian');

  // The threshold is the first amount after the metric name.
  const metricIndex = metricHit[0]?.index ?? 0;
  const amountRe = new RegExp(AMOUNT_PATTERN, 'g');
  amountRe.lastIndex = metricIndex;
  const amount = amountRe.exec(rest);
  const threshold = amount ? readAmount(amount[1], amount[2]) : defaultThreshold(metric);
  if (!amount) missing.push('ngưỡng');

  const afterMetric = text.slice(metricIndex);
  const opHits = OPERATORS.map(([op, re]) => ({ op, index: afterMetric.search(re) })).filter((o) => o.index !== -1);
  opHits.sort((a, b) => a.index - b.index);
  const operator = opHits[0]?.op ?? defaultOperator(metric);

  const platform = PLATFORMS.find(([, re]) => re.test(text))?.[0] ?? 'all';

  return {
    rule: {
      platform,
      condition: { metric, operator, threshold, lookbackDays },
      action: action === 'increase_budget' || action === 'decrease_budget' ? { type: action, value: change } : { type: action },
    },
    missing,
  };
}

function nearestLookback(days: number): number {
  return LOOKBACK_OPTIONS.reduce((best, d) => (Math.abs(d - days) < Math.abs(best - days) ? d : best), DEFAULT_LOOKBACK);
}

/** Without an operator, "CPA 150k" means "above" and "ROAS 1,5" means "below": the worrying side. */
const defaultOperator = (metric: RuleMetric): RuleOperator => (metric === 'cpa' || metric === 'spend' ? 'gt' : 'lt');

const defaultThreshold = (metric: RuleMetric) => ({ cpa: 150_000, spend: 1_000_000, roas: 1.5, ctr: 0.5 })[metric];
