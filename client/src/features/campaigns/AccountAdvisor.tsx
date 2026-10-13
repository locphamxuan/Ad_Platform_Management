import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AiBadge, EmptyState, ErrorMessage, PlatformTag, ScoreRing, Tag } from '../../components/ui';
import { Icon } from '../../components/icons';
import { api } from '../../lib/api';
import { PLATFORM_META } from '../../lib/constants';
import { formatCompactVnd, formatDecimal, formatVnd } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { AdAccountOption, CampaignDetail, Platform } from '../../lib/types';
import { describeAdvice, describeOtherPlatform } from './campaign-insights';

const PARTS = [
  { key: 'performance', label: 'Hiệu quả', max: 50 },
  { key: 'runway', label: 'Hạn mức', max: 25 },
  { key: 'focus', label: 'Ít cạnh tranh', max: 15 },
  { key: 'maturity', label: 'Ổn định', max: 10 },
] as const;

export interface AccountChoice {
  platform: Platform;
  account: AdAccountOption;
  /** Take over from the original (same platform) instead of adding a paused copy */
  move: boolean;
}

/**
 * Every ad account the campaign could run in, ranked by the server's advisor, with the reasons.
 * Pick any account card, then move the campaign there, duplicate it, or expand to that platform.
 */
export function AccountAdvisor({
  detail,
  canManage,
  busy,
  onChoose,
}: {
  detail: CampaignDetail;
  canManage: boolean;
  busy: boolean;
  onChoose: (choice: AccountChoice) => void;
}) {
  const { campaign, accountCounts } = detail;
  // Other platforms show how this campaign would rank there, for expanding it to more channels.
  const [platform, setPlatform] = useState<Platform>(campaign.platform);
  const [picked, setPicked] = useState<Partial<Record<Platform, string>>>({});
  const own = platform === campaign.platform;
  const other = useQuery({
    queryKey: queryKeys.campaignAccounts(campaign.id, platform),
    queryFn: () => api.campaigns.accounts(campaign.id, platform),
    enabled: !own,
  });
  const advice = own ? detail.advice : (other.data ?? { accounts: [], recommendedId: null, lookbackDays: 30 });
  const total = accountCounts.reduce((sum, c) => sum + c.total, 0);
  const summary = own ? describeAdvice(advice.accounts) : describeOtherPlatform(advice.accounts, PLATFORM_META[platform].label);
  // Pre-selects the advisor's pick so the best move is one click away.
  const selected =
    advice.accounts.find((a) => a.id === picked[platform]) ??
    advice.accounts.find((a) => a.recommended) ??
    advice.accounts[0];
  const blocked = !campaign.creative
    ? 'Chiến dịch chưa có nội dung quảng cáo lưu trong AdHub'
    : !campaign.connected
      ? 'Nền tảng đang mất kết nối'
      : selected && !selected.fit.eligible
        ? 'Tài khoản này chưa đủ điều kiện chạy (bị khoá hoặc hết hạn mức)'
        : null;

  return (
    // overflow-clip rather than hidden, so the action bar can stay sticky while scrolling.
    <section className="card overflow-clip" aria-labelledby="accounts-title">
      <div className="bg-ai-wash px-5 pb-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="accounts-title" className="section-title">
                Tài khoản quảng cáo
              </h2>
              <AiBadge label="Trợ lý chấm điểm" />
            </div>
            <p className="mt-1 text-xs text-muted">
              Xếp hạng theo hiệu quả {advice.lookbackDays || 30} ngày với cùng mục tiêu, hạn mức chi tiêu còn lại, số chiến dịch
              cạnh tranh và độ ổn định phân phối.
            </p>
          </div>
          <div className="flex items-stretch gap-2">
            <div className="rounded-xl border border-line bg-surface px-3.5 py-2 text-center">
              <p className="text-xl font-semibold tabular-nums">{advice.accounts.length}</p>
              <p className="text-2xs text-muted">trên {PLATFORM_META[platform].label}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface px-3.5 py-2 text-center">
              <p className="text-xl font-semibold tabular-nums">{total}</p>
              <p className="text-2xs text-muted">toàn workspace</p>
            </div>
          </div>
        </div>
        {accountCounts.length > 0 && (
          <div role="tablist" aria-label="Tài khoản theo nền tảng" className="mt-4 flex flex-wrap gap-2">
            {accountCounts.map((c) => {
              const selected = c.platform === platform;
              return (
                <button
                  key={c.platform}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPlatform(c.platform)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-all ${
                    selected
                      ? 'border-accent/40 bg-accent-soft shadow-soft ring-1 ring-accent/25'
                      : 'border-line bg-surface hover:-translate-y-px hover:border-accent/30 hover:shadow-soft'
                  }`}
                >
                  <PlatformTag platform={c.platform} compact />
                  <span className="font-medium">{PLATFORM_META[c.platform].label}</span>
                  <span className="tabular-nums text-muted">
                    {c.total} tài khoản{c.active < c.total && ` · ${c.total - c.active} bị khoá`}
                  </span>
                  {c.platform === campaign.platform && <span className="text-2xs font-semibold text-accent">· đang chạy</span>}
                </button>
              );
            })}
          </div>
        )}
        {!own && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted">
            <Icon name="info" size={14} className="mt-px shrink-0" />
            <p>
              Chiến dịch đang chạy trên {PLATFORM_META[campaign.platform].label}. Đây là xếp hạng tham khảo nếu mở rộng sang{' '}
              {PLATFORM_META[platform].label} với cùng mục tiêu và ngân sách {formatVnd(campaign.dailyBudget)}/ngày.{' '}
              {canManage && (
                <Link to="/campaigns/new" className="whitespace-nowrap font-semibold text-accent hover:underline">
                  Tạo chiến dịch đa kênh →
                </Link>
              )}
            </p>
          </div>
        )}
        {summary && (
          <p
            role="status"
            className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
              summary.tone === 'positive' ? 'bg-positive-soft text-positive' : summary.tone === 'ai' ? 'bg-spark-soft text-ink' : 'bg-caution-soft text-caution'
            }`}
          >
            <Icon name={summary.tone === 'positive' ? 'check' : summary.tone === 'ai' ? 'sparkles' : 'alert'} size={16} className="mt-0.5 shrink-0" />
            {summary.text}
          </p>
        )}
      </div>

      {!own && other.error ? (
        <div className="p-5">
          <ErrorMessage error={other.error} />
        </div>
      ) : !own && other.isLoading ? (
        <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-72 rounded-2xl" />
          ))}
        </div>
      ) : advice.accounts.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Chưa đọc được tài khoản quảng cáo" icon="plug">
            {PLATFORM_META[platform].label} đang mất kết nối. Kết nối lại trong mục Kết nối nền tảng để xem và so sánh tài khoản.
          </EmptyState>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label={`Chọn tài khoản ${PLATFORM_META[platform].label}`} className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 2xl:grid-cols-3">
            {advice.accounts.map((account, index) => (
              <AccountCard
                key={account.id}
                rank={index + 1}
                account={account}
                selected={account.id === selected?.id}
                onSelect={() => setPicked((p) => ({ ...p, [platform]: account.id }))}
              />
            ))}
          </div>
          {canManage && selected && (
            <ActionBar
              platformLabel={PLATFORM_META[platform].label}
              own={own}
              account={selected}
              blocked={blocked}
              busy={busy}
              onChoose={(move) => onChoose({ platform, account: selected, move })}
            />
          )}
        </>
      )}
    </section>
  );
}

/** What can be done with the picked account; sticks to the bottom while the cards scroll by. */
function ActionBar({
  platformLabel,
  own,
  account,
  blocked,
  busy,
  onChoose,
}: {
  platformLabel: string;
  own: boolean;
  account: AdAccountOption;
  blocked: string | null;
  busy: boolean;
  onChoose: (move: boolean) => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-5 py-3.5 backdrop-blur sm:px-6">
      {/* A minimum width so the buttons wrap below instead of squeezing the account name. */}
      <div className="min-w-[14rem] flex-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted">Đã chọn</p>
        <p className="text-sm font-semibold text-ink">
          {account.name} <span className="font-normal text-muted">· {account.fit.score}/100</span>
        </p>
        {blocked && <p className="text-xs text-caution">{blocked}</p>}
      </div>
      {own && account.current ? (
        <p className="flex items-center gap-1.5 text-sm text-positive">
          <Icon name="check" size={15} /> Chiến dịch đang chạy ở tài khoản này — chọn tài khoản khác để chuyển
        </p>
      ) : own ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={Boolean(blocked) || busy}
            title="Tạo bản sao ở tài khoản này, tạm dừng chờ duyệt; bản gốc giữ nguyên"
            onClick={() => onChoose(false)}
          >
            <Icon name="copy" size={15} /> Nhân bản (giữ bản gốc)
          </button>
          <button
            type="button"
            className="btn-ai"
            disabled={Boolean(blocked) || busy}
            title="Bản mới ở tài khoản này nhận trạng thái đang chạy, bản gốc tạm dừng"
            onClick={() => onChoose(true)}
          >
            <Icon name="arrowRight" size={15} /> {busy ? 'Đang xử lý…' : 'Chuyển sang tài khoản này'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-ai"
          disabled={Boolean(blocked) || busy}
          title="Tạo chiến dịch cùng nội dung trên nền tảng này, tạm dừng chờ duyệt"
          onClick={() => onChoose(false)}
        >
          <Icon name="plus" size={15} /> {busy ? 'Đang tạo…' : `Mở rộng sang ${platformLabel} ở tài khoản này`}
        </button>
      )}
    </div>
  );
}

function AccountCard({
  rank,
  account,
  selected,
  onSelect,
}: {
  rank: number;
  account: AdAccountOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const { fit, kpis } = account;
  const used = account.spendCap ? Math.min(1, (account.amountSpent ?? 0) / account.spendCap) : null;
  return (
    // A div, not a button: the card holds lists and blocks, which buttons may not contain.
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      aria-label={`${account.name}, điểm ${fit.score}/100`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`relative flex cursor-pointer flex-col rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 ${
        account.recommended ? 'card-ai shadow-glow' : 'border border-line bg-surface-raised hover:shadow-soft'
      } ${selected ? 'outline outline-2 outline-offset-2 outline-accent' : ''} ${fit.eligible ? '' : 'opacity-70'}`}
    >
      {selected && (
        <span aria-hidden className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white shadow-soft">
          <Icon name="check" size={14} strokeWidth={2.6} />
        </span>
      )}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-2xs font-bold tabular-nums ${
            account.recommended ? 'bg-ai-gradient text-white' : 'bg-ink/5 text-muted'
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink" title={account.name}>
            {account.name}
          </p>
          <p className="truncate font-mono text-2xs text-subtle" translate="no">
            {account.id}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {account.recommended && <AiBadge label="Đề xuất" />}
            {account.current && <Tag tone="accent">Đang chạy ở đây</Tag>}
            {account.primary && <Tag>Tài khoản chính</Tag>}
            {!account.active && <Tag tone="negative">Bị vô hiệu hoá</Tag>}
          </div>
        </div>
        <ScoreRing score={fit.score} size={48} label={`Điểm phù hợp ${fit.score}/100`} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ink/[0.03] p-2.5 text-center">
        <div>
          <dt className="text-2xs text-muted">Chiến dịch</dt>
          <dd className="text-sm font-semibold tabular-nums">
            {account.activeCampaigns}/{account.campaigns}
          </dd>
        </div>
        <div>
          <dt className="text-2xs text-muted">Chi 30 ngày</dt>
          <dd className="text-sm font-semibold tabular-nums" title={formatVnd(kpis.spend)}>
            {kpis.spend > 0 ? `${formatCompactVnd(kpis.spend)}đ` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-2xs text-muted">ROAS</dt>
          <dd className="text-sm font-semibold tabular-nums">{kpis.spend > 0 ? `${formatDecimal(kpis.roas)}x` : '—'}</dd>
        </div>
      </dl>

      {fit.eligible && (
        <div className="mt-3 space-y-1.5" aria-label="Điểm thành phần">
          {PARTS.map((part) => (
            <div key={part.key} className="flex items-center gap-2 text-2xs">
              <span className="w-20 shrink-0 text-muted">{part.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/5">
                <span
                  className="block h-full rounded-full bg-ai-gradient"
                  style={{ width: `${(fit.breakdown[part.key] / part.max) * 100}%` }}
                />
              </span>
              <span className="w-10 text-right tabular-nums text-muted">
                {fit.breakdown[part.key]}/{part.max}
              </span>
            </div>
          ))}
        </div>
      )}

      {used !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-2xs text-muted">
            <span>Hạn mức chi tiêu</span>
            <span className="tabular-nums">
              {formatCompactVnd(account.amountSpent ?? 0)} / {formatCompactVnd(account.spendCap!)}đ
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/5">
            <div
              className={`h-full rounded-full ${used >= 0.9 ? 'bg-negative' : used >= 0.7 ? 'bg-caution' : 'bg-positive'}`}
              style={{ width: `${Math.max(used * 100, 2)}%` }}
            />
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-1 text-xs">
        {fit.pros.slice(0, 3).map((pro) => (
          <li key={pro} className="flex gap-1.5 text-ink-soft">
            <Icon name="check" size={13} className="mt-0.5 shrink-0 text-positive" />
            {pro}
          </li>
        ))}
        {fit.cons.slice(0, 2).map((con) => (
          <li key={con} className="flex gap-1.5 text-caution">
            <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
            {con}
          </li>
        ))}
      </ul>
    </div>
  );
}
