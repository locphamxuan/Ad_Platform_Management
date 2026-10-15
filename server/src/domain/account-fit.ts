import { formatVnd } from './format.js';
import type { Kpis } from './metrics.js';
import type { AdAccount, Objective } from './types.js';

/**
 * Which ad account a campaign should run in. Each account is scored 0–100 from what it has already
 * delivered and what it can still deliver:
 *   performance 50 — the account's results on this objective against the platform's yardstick
 *   runway      25 — days of this campaign's budget left before the account's spending limit
 *   focus       15 — running campaigns with the same objective it would compete with
 *   maturity    10 — how steadily the account has delivered lately
 * Disabled accounts and accounts at their spending limit are never recommended.
 */

export interface AccountHistory {
  /** Results of the account's other campaigns over the lookback */
  all: Kpis;
  /** The same, limited to campaigns with the objective being placed */
  sameObjective: Kpis;
  /** Days in the lookback on which the account spent anything */
  activeDays: number;
  /** Running campaigns with the same objective, not counting the one being placed */
  competingCampaigns: number;
}

export interface AccountCandidate {
  account: AdAccount;
  history: AccountHistory;
}

export interface FitContext {
  objective: Objective;
  dailyBudget: number;
  /** The platform's results for this objective across every account: the yardstick */
  benchmark: Kpis;
  /** Where the campaign runs today; it wins ties so nothing moves without a reason */
  currentAccountId?: string;
}

export interface AccountFit {
  accountId: string;
  score: number;
  eligible: boolean;
  /** Days of the campaign's budget left before the spending limit; null = no limit */
  runwayDays: number | null;
  breakdown: { performance: number; runway: number; focus: number; maturity: number };
  pros: string[];
  cons: string[];
}

/** The lookback the advisor reads, and the runway that counts as comfortable. */
export const FIT_LOOKBACK_DAYS = 30;
const COMFORTABLE_RUNWAY_DAYS = 30;
const SHORT_RUNWAY_DAYS = 14;
const MATURE_ACTIVE_DAYS = 14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const decimal = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const percent = (ratio: number) => `${Math.round(Math.abs(ratio - 1) * 100)}%`;

const OBJECTIVE_METRIC: Record<Objective, { key: 'roas' | 'cpa' | 'cpc' | 'cpm'; better: 'higher' | 'lower'; label: (k: Kpis) => string }> = {
  sales: { key: 'roas', better: 'higher', label: (k) => `ROAS ${decimal(k.roas)}x` },
  leads: { key: 'cpa', better: 'lower', label: (k) => `CPA ${formatVnd(Math.round(k.cpa))}` },
  traffic: { key: 'cpc', better: 'lower', label: (k) => `CPC ${formatVnd(Math.round(k.cpc))}` },
  awareness: { key: 'cpm', better: 'lower', label: (k) => `CPM ${formatVnd(Math.round(k.cpm))}` },
  engagement: { key: 'cpc', better: 'lower', label: (k) => `CPC ${formatVnd(Math.round(k.cpc))}` },
  app_promotion: { key: 'cpa', better: 'lower', label: (k) => `CPA ${formatVnd(Math.round(k.cpa))}` },
};

/** How many times better than the yardstick the account did; null when either side has no data. */
function efficiency(kpis: Kpis, benchmark: Kpis, objective: Objective): number | null {
  const { key, better } = OBJECTIVE_METRIC[objective];
  const mine = kpis[key];
  const typical = benchmark[key];
  if (kpis.spend === 0 || mine <= 0 || typical <= 0) return null;
  return better === 'higher' ? mine / typical : typical / mine;
}

export function scoreAccount({ account, history }: AccountCandidate, context: FitContext): AccountFit {
  const pros: string[] = [];
  const cons: string[] = [];
  const zero = { performance: 0, runway: 0, focus: 0, maturity: 0 };

  if (!account.active) {
    return { accountId: account.id, score: 0, eligible: false, runwayDays: null, breakdown: zero, pros, cons: ['Tài khoản đang bị vô hiệu hoá trên nền tảng'] };
  }


  
  // Runway first: an account at its limit cannot take the campaign whatever its history.
  let runwayDays: number | null = null;
  let runway = 25;
  if (account.spendCap !== null) {
    const remaining = Math.max(0, account.spendCap - (account.amountSpent ?? 0));
    runwayDays = Math.floor(remaining / Math.max(context.dailyBudget, 1));
    if (remaining === 0 || runwayDays === 0) {
      return {
        accountId: account.id,
        score: 0,
        eligible: false,
        runwayDays: 0,
        breakdown: zero,
        pros,
        cons: [`Đã chạm giới hạn chi tiêu ${formatVnd(account.spendCap)} của tài khoản`],
      };
    }
    runway = clamp(runwayDays / COMFORTABLE_RUNWAY_DAYS, 0, 1) * 25;
    if (runwayDays < SHORT_RUNWAY_DAYS) cons.push(`Hạn mức còn ${formatVnd(remaining)} — chỉ đủ ~${runwayDays} ngày với ngân sách này`);
    else if (runwayDays >= COMFORTABLE_RUNWAY_DAYS) pros.push(`Hạn mức chi tiêu còn ${formatVnd(remaining)}, đủ hơn ${COMFORTABLE_RUNWAY_DAYS} ngày`);
  } else {
    pros.push('Không giới hạn tổng chi tiêu');
  }

  // Same-objective history speaks best for this campaign; the account's overall results are the fallback.
  const sameObjective = history.sameObjective.spend > 0;
  const kpis = sameObjective ? history.sameObjective : history.all;
  const ratio = efficiency(kpis, context.benchmark, context.objective);
  let performance = 25;
  if (ratio === null) {
    cons.push('Chưa có lịch sử phù hợp để đối chiếu hiệu quả');
  } else {
    performance = (clamp(ratio, 0, 2) / 2) * 50;
    const what = `${OBJECTIVE_METRIC[context.objective].label(kpis)}${sameObjective ? ' với chiến dịch cùng mục tiêu' : ''}`;
    if (ratio >= 1.1) pros.push(`${what}, tốt hơn mặt bằng nền tảng ${percent(ratio)}`);
    else if (ratio <= 0.9) cons.push(`${what}, kém mặt bằng nền tảng ${percent(ratio)}`);
    else pros.push(`${what}, ngang mặt bằng nền tảng`);
  }

  const focus = [15, 10, 5][history.competingCampaigns] ?? 0;
  if (history.competingCampaigns === 0) pros.push('Không có chiến dịch cùng mục tiêu đang chạy để tranh đấu giá');
  else if (history.competingCampaigns >= 2) {
    cons.push(`${history.competingCampaigns} chiến dịch cùng mục tiêu đang chạy — dễ chồng tệp và tự đẩy giá thầu`);
  }

  const maturity = clamp(history.activeDays / MATURE_ACTIVE_DAYS, 0, 1) * 10;
  if (history.activeDays >= MATURE_ACTIVE_DAYS) pros.push(`Phân phối đều đặn (${history.activeDays}/${FIT_LOOKBACK_DAYS} ngày có chi tiêu)`);
  else if (history.activeDays === 0 && ratio !== null) cons.push('Gần đây tài khoản không phân phối quảng cáo');

  const breakdown = {
    performance: Math.round(performance),
    runway: Math.round(runway),
    focus,
    maturity: Math.round(maturity),
  };
  const score = breakdown.performance + breakdown.runway + breakdown.focus + breakdown.maturity;
  return { accountId: account.id, score, eligible: true, runwayDays, breakdown, pros, cons };
}

/** Best first: eligible accounts by score, the current account winning ties. */
export function rankAccounts(candidates: readonly AccountCandidate[], context: FitContext): AccountFit[] {
  const isCurrent = (fit: AccountFit) => (fit.accountId === context.currentAccountId ? 1 : 0);
  return candidates
    .map((candidate) => scoreAccount(candidate, context))
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) || b.score - a.score || isCurrent(b) - isCurrent(a),
    );
}
