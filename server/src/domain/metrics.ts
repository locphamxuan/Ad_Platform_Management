import type { MetricDaily } from './types.js';

export interface MetricTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface Kpis extends MetricTotals {
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
}

const EMPTY_TOTALS: MetricTotals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };

export function sumMetrics(rows: readonly MetricDaily[]): MetricTotals {
  return rows.reduce<MetricTotals>(
    (acc, row) => ({
      spend: acc.spend + row.spend,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      conversions: acc.conversions + row.conversions,
      revenue: acc.revenue + row.revenue,
    }),
    { ...EMPTY_TOTALS },
  );
}

const safeDivide = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function toKpis(totals: MetricTotals): Kpis {
  return {
    ...totals,
    ctr: safeDivide(totals.clicks, totals.impressions) * 100,
    cpc: safeDivide(totals.spend, totals.clicks),
    cpm: safeDivide(totals.spend, totals.impressions) * 1000,
    cpa: safeDivide(totals.spend, totals.conversions),
    roas: safeDivide(totals.revenue, totals.spend),
  };
}
