import { describe, expect, it } from 'vitest';
import { rankAccounts, scoreAccount, type AccountCandidate, type AccountHistory } from '../src/domain/account-fit.js';
import { toKpis } from '../src/domain/metrics.js';
import type { AdAccount } from '../src/domain/types.js';

const kpis = (spend: number, revenue: number, conversions = 10) =>
  toKpis({ spend, revenue, conversions, impressions: spend / 50, clicks: spend / 2_000 });

const NONE = kpis(0, 0, 0);
const BENCHMARK = kpis(10_000_000, 30_000_000); // ROAS 3x

const account = (id: string, changes: Partial<AdAccount> = {}): AdAccount => ({
  id,
  name: id,
  active: true,
  spendCap: null,
  amountSpent: null,
  ...changes,
});

const history = (changes: Partial<AccountHistory> = {}): AccountHistory => ({
  all: NONE,
  sameObjective: NONE,
  activeDays: 0,
  competingCampaigns: 0,
  ...changes,
});

const context = { objective: 'sales' as const, dailyBudget: 1_000_000, benchmark: BENCHMARK };

describe('account fit', () => {
  it('prefers the account whose same-objective campaigns beat the platform', () => {
    const strong: AccountCandidate = { account: account('strong'), history: history({ sameObjective: kpis(5_000_000, 25_000_000), activeDays: 30 }) };
    const weak: AccountCandidate = { account: account('weak'), history: history({ sameObjective: kpis(5_000_000, 7_500_000), activeDays: 30 }) };
    const [best, second] = rankAccounts([weak, strong], context);
    expect(best.accountId).toBe('strong');
    expect(best.pros.join(' ')).toMatch(/ROAS 5x .*tốt hơn mặt bằng nền tảng 67%/);
    expect(second.cons.join(' ')).toMatch(/kém mặt bằng/);
  });

  it('never recommends a disabled account or one at its spending limit', () => {
    const disabled = scoreAccount({ account: account('off', { active: false }), history: history() }, context);
    const capped = scoreAccount(
      { account: account('capped', { spendCap: 10_000_000, amountSpent: 10_000_000 }), history: history() },
      context,
    );
    expect(disabled).toMatchObject({ eligible: false, score: 0 });
    expect(capped).toMatchObject({ eligible: false, runwayDays: 0 });
    expect(capped.cons[0]).toMatch(/giới hạn chi tiêu/);
  });

  it('counts the days of budget left before the spending limit', () => {
    const fit = scoreAccount(
      { account: account('short', { spendCap: 40_000_000, amountSpent: 35_000_000 }), history: history() },
      context,
    );
    expect(fit.runwayDays).toBe(5);
    expect(fit.breakdown.runway).toBe(4);
    expect(fit.cons.join(' ')).toMatch(/chỉ đủ ~5 ngày/);
  });

  it('penalises accounts already running several campaigns with the same objective', () => {
    const busy = scoreAccount({ account: account('busy'), history: history({ competingCampaigns: 3 }) }, context);
    const free = scoreAccount({ account: account('free'), history: history() }, context);
    expect(free.score - busy.score).toBe(15);
    expect(busy.cons.join(' ')).toMatch(/3 chiến dịch cùng mục tiêu/);
  });

  it('judges lead campaigns by cost per lead, where lower is better', () => {
    const cheap = scoreAccount(
      { account: account('cheap'), history: history({ sameObjective: kpis(1_000_000, 0, 20) }) },
      { ...context, objective: 'leads', benchmark: kpis(1_000_000, 0, 10) },
    );
    expect(cheap.breakdown.performance).toBe(50);
    expect(cheap.pros[1]).toMatch(/^CPA 50\.000/);
  });

  it('keeps the campaign where it is when accounts tie', () => {
    const [best] = rankAccounts(
      [{ account: account('a'), history: history() }, { account: account('b'), history: history() }],
      { ...context, currentAccountId: 'b' },
    );
    expect(best.accountId).toBe('b');
  });
});
