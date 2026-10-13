import { PLATFORM_META } from './constants';
import { formatCompactVnd, formatDecimal, formatPercent, formatVnd } from './format';
import type { Campaign, CampaignStatus, DashboardSummary, Kpis, Platform } from './types';

/**
 * The assistant's reasoning, kept free of React so it can be tested: health scores, optimisation
 * recommendations, a plain-language briefing and budget suggestions, all derived from the numbers
 * the server already returns. Nothing here calls an external model.
 */

/** Below this ROAS a campaign loses money on ad spend alone. */
export const LOSS_ROAS = 1;
/** Below this ROAS a running campaign is flagged for review. */
export const LOW_ROAS = 2;
/** At or above this ROAS a campaign is worth more budget. */
export const SCALE_ROAS = 4;
/** A paused campaign that performed at least this well is worth turning back on. */
export const REACTIVATE_ROAS = 3;
/** Budget step used by recommendations, in percent of the current daily budget. */
export const BUDGET_STEP_PERCENT = 20;
/** Mirrors the server's automation ceiling (server/src/domain/rules.ts). */
export const MAX_DAILY_BUDGET = 50_000_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundThousand = (value: number) => Math.round(value / 1000) * 1000;

/** Percent change from `previous` to `current`; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Typical CPA among campaigns that converted; the yardstick for "expensive". */
export function typicalCpa(campaigns: readonly Campaign[]): number {
  return median(campaigns.filter((c) => c.kpis.conversions > 0).map((c) => c.kpis.cpa));
}

/** Campaigns that spent less than this in the period are too new to judge. */
const hasSignal = (c: Campaign) => c.kpis.spend > 0 && c.kpis.spend >= c.dailyBudget * 0.5;

export interface Health {
  score: number;
  label: 'Tốt' | 'Ổn' | 'Cần xem' | 'Chưa đủ dữ liệu';
}

/** 0–100: return on spend weighs most, then cost per conversion against the account, then CTR. */
export function campaignHealth(kpis: Kpis, accountCpa: number): Health {
  if (kpis.spend === 0) return { score: 50, label: 'Chưa đủ dữ liệu' };
  const roasPart = clamp(kpis.roas / SCALE_ROAS, 0, 1) * 50;
  const cpaPart = kpis.conversions === 0 || accountCpa === 0 ? 0 : (clamp(accountCpa / kpis.cpa, 0, 1.5) / 1.5) * 30;
  const ctrPart = clamp(kpis.ctr / 2, 0, 1) * 20;
  const score = Math.round(roasPart + cpaPart + ctrPart);
  return { score, label: score >= 70 ? 'Tốt' : score >= 45 ? 'Ổn' : 'Cần xem' };
}

export type RecommendationAction =
  | { kind: 'status'; status: CampaignStatus }
  | { kind: 'budget'; dailyBudget: number };

export interface Recommendation {
  id: string;
  campaignId: string;
  campaignName: string;
  platform: Platform;
  severity: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  /** What applying it is expected to change, per day */
  impact: string;
  action: RecommendationAction;
}

interface RecommendOptions {
  /** Minimum daily budget per platform; a decrease never goes below it */
  minBudget?: ReadonlyMap<Platform, number>;
  /** The user's per-campaign cap; an increase never goes above it. null = uncapped */
  limit?: number | null;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** At most one recommendation per campaign, the most urgent first. */
export function recommend(campaigns: readonly Campaign[], options: RecommendOptions = {}): Recommendation[] {
  const accountCpa = typicalCpa(campaigns);
  const result: Recommendation[] = [];
  for (const c of campaigns) {
    // A campaign moved to another account is retired; its replacement gets the advice instead.
    if (!c.connected || c.replacedBy) continue;
    const rec = recommendFor(c, accountCpa, options);
    if (rec) result.push(rec);
  }
  return result.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function recommendFor(c: Campaign, accountCpa: number, { minBudget, limit = null }: RecommendOptions): Recommendation | null {
  const base = { campaignId: c.id, campaignName: c.name, platform: c.platform };
  const { kpis } = c;

  if (c.status === 'PAUSED') {
    if (kpis.spend > 0 && kpis.roas >= REACTIVATE_ROAS) {
      return {
        ...base,
        id: `${c.id}:activate`,
        severity: 'low',
        title: 'Bật lại chiến dịch hiệu quả',
        reason: `Đang tạm dừng dù ROAS trong kỳ đạt ${formatDecimal(kpis.roas)}x.`,
        impact: `Có thể mang về ~${formatCompactVnd(c.dailyBudget * kpis.roas)}đ doanh thu/ngày`,
        action: { kind: 'status', status: 'ACTIVE' },
      };
    }
    return null;
  }

  if (!hasSignal(c)) return null;

  // Spending without converting at all: the clearest waste.
  if (kpis.conversions === 0 && (accountCpa === 0 || kpis.spend >= accountCpa * 2)) {
    return {
      ...base,
      id: `${c.id}:pause`,
      severity: 'high',
      title: 'Tạm dừng: chi tiêu chưa ra chuyển đổi',
      reason: `Đã chi ${formatVnd(kpis.spend)} mà chưa có chuyển đổi nào.`,
      impact: `Tiết kiệm ${formatVnd(c.dailyBudget)}/ngày`,
      action: { kind: 'status', status: 'PAUSED' },
    };
  }

  if (kpis.roas < LOSS_ROAS) {
    return {
      ...base,
      id: `${c.id}:pause`,
      severity: 'high',
      title: 'Tạm dừng: đang lỗ trên chi phí quảng cáo',
      reason: `ROAS ${formatDecimal(kpis.roas)}x — mỗi 1đ chi chỉ thu về ${formatDecimal(kpis.roas)}đ.`,
      impact: `Tiết kiệm ${formatVnd(c.dailyBudget)}/ngày`,
      action: { kind: 'status', status: 'PAUSED' },
    };
  }

  if (kpis.roas < LOW_ROAS) {
    const floor = minBudget?.get(c.platform) ?? 0;
    const next = Math.max(roundThousand(c.dailyBudget * (1 - BUDGET_STEP_PERCENT / 100)), floor);
    if (next >= c.dailyBudget) return null;
    return {
      ...base,
      id: `${c.id}:decrease`,
      severity: 'medium',
      title: `Giảm ${BUDGET_STEP_PERCENT}% ngân sách`,
      reason: `ROAS ${formatDecimal(kpis.roas)}x dưới mục tiêu ${LOW_ROAS}x.`,
      impact: `Giảm ${formatVnd(c.dailyBudget - next)}/ngày`,
      action: { kind: 'budget', dailyBudget: next },
    };
  }

  if (kpis.roas >= SCALE_ROAS && kpis.conversions > 0) {
    const ceiling = Math.min(limit ?? MAX_DAILY_BUDGET, MAX_DAILY_BUDGET);
    const next = Math.min(roundThousand(c.dailyBudget * (1 + BUDGET_STEP_PERCENT / 100)), ceiling);
    if (next <= c.dailyBudget) return null;
    return {
      ...base,
      id: `${c.id}:increase`,
      severity: 'low',
      title: `Tăng ${BUDGET_STEP_PERCENT}% ngân sách`,
      reason: `ROAS ${formatDecimal(kpis.roas)}x, CPA ${formatVnd(kpis.cpa)} — còn dư địa mở rộng.`,
      impact: `Dự kiến thêm ~${formatCompactVnd((next - c.dailyBudget) * kpis.roas)}đ doanh thu/ngày`,
      action: { kind: 'budget', dailyBudget: next },
    };
  }

  return null;
}

/** Daily spend for the whole account, oldest first. */
export function dailyTotals(daily: DashboardSummary['dailySpend']): number[] {
  return daily.map(({ date: _date, ...perPlatform }) =>
    Object.values(perPlatform).reduce<number>((sum, v) => sum + (v ?? 0), 0),
  );
}

export interface Anomaly {
  date: string;
  value: number;
  /** How many times the usual day this one was */
  ratio: number;
  direction: 'spike' | 'drop';
}

/** The latest day if it is far off the rest of the period (at least 1.8× or under 0.45× the median). */
export function detectSpendAnomaly(daily: DashboardSummary['dailySpend']): Anomaly | null {
  const totals = dailyTotals(daily);
  if (totals.length < 4) return null;
  const last = totals[totals.length - 1];
  const usual = median(totals.slice(0, -1));
  if (usual === 0) return null;
  const ratio = last / usual;
  if (ratio >= 1.8) return { date: daily[daily.length - 1].date, value: last, ratio, direction: 'spike' };
  if (ratio <= 0.45) return { date: daily[daily.length - 1].date, value: last, ratio, direction: 'drop' };
  return null;
}

/** Spend for a whole calendar month at the period's average daily pace. */
export function projectMonthlySpend(daily: DashboardSummary['dailySpend'], now: Date): number {
  const totals = dailyTotals(daily);
  if (totals.length === 0) return 0;
  const average = totals.reduce((a, b) => a + b, 0) / totals.length;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return average * daysInMonth;
}

/**
 * Shares (whole percents, summing to 100) weighted by each platform's ROAS, so money follows
 * results. Every platform keeps at least `floor` percent to keep learning; platforms without data
 * get the average weight.
 */
export function suggestAllocation(
  platforms: readonly Platform[],
  roasByPlatform: ReadonlyMap<Platform, number>,
  floor = 15,
): Partial<Record<Platform, number>> {
  if (platforms.length === 0) return {};
  if (platforms.length === 1) return { [platforms[0]]: 100 };
  const known = platforms.map((p) => roasByPlatform.get(p)).filter((r): r is number => r !== undefined && r > 0);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weights = platforms.map((p) => {
    const roas = roasByPlatform.get(p);
    return roas !== undefined && roas > 0 ? roas : fallback;
  });
  const safeFloor = Math.min(floor, Math.floor(100 / platforms.length));
  const free = 100 - safeFloor * platforms.length;
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => safeFloor + Math.floor((free * w) / weightSum));
  // Hand the rounding remainder to the strongest platform.
  const best = weights.indexOf(Math.max(...weights));
  shares[best] += 100 - shares.reduce((a, b) => a + b, 0);
  return Object.fromEntries(platforms.map((p, i) => [p, shares[i]]));
}

export interface Briefing {
  headline: string;
  points: string[];
}

const describeChange = (change: number | null) =>
  change === null ? '' : Math.abs(change) < 0.5 ? ' (không đổi)' : ` (${change > 0 ? 'tăng' : 'giảm'} ${formatPercent(Math.abs(change))})`;

/** A few sentences an account manager would say about the period, best and worst platform first. */
export function briefing(current: DashboardSummary, previous?: DashboardSummary): Briefing {
  const { totals } = current;
  const prev = previous?.totals;
  const roasChange = prev ? percentChange(totals.roas, prev.roas) : null;
  const spendChange = prev ? percentChange(totals.spend, prev.spend) : null;

  const tone =
    totals.spend === 0
      ? 'Chưa có chi tiêu trong kỳ này.'
      : totals.roas >= SCALE_ROAS
        ? 'Hiệu quả rất tốt — có thể mạnh dạn mở rộng ngân sách.'
        : totals.roas >= LOW_ROAS
          ? 'Hiệu quả ổn định, vẫn còn chỗ tối ưu.'
          : 'Hiệu quả dưới mục tiêu — nên rà soát các chiến dịch lỗ.';

  const points = [
    `Chi tiêu ${formatVnd(totals.spend)}${describeChange(spendChange)}, mang về ${formatVnd(totals.revenue)} doanh thu.`,
    `ROAS toàn tài khoản ${formatDecimal(totals.roas)}x${describeChange(roasChange)}, CPA trung bình ${formatVnd(totals.cpa)}.`,
  ];

  const ranked = current.byPlatform.filter((p) => p.kpis.spend > 0).sort((a, b) => b.kpis.roas - a.kpis.roas);
  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    points.push(
      `${PLATFORM_META[best.platform].label} dẫn đầu với ROAS ${formatDecimal(best.kpis.roas)}x; ${PLATFORM_META[worst.platform].label} thấp nhất (${formatDecimal(worst.kpis.roas)}x).`,
    );
    if (best.kpis.roas >= worst.kpis.roas * 1.5) {
      points.push(
        `Gợi ý: chuyển dần ngân sách từ ${PLATFORM_META[worst.platform].label} sang ${PLATFORM_META[best.platform].label}.`,
      );
    }
  }
  return { headline: tone, points };
}
