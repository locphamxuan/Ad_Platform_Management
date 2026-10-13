import { AiBadge, EmptyState, PlatformTag, ScoreRing, Tag } from '../../components/ui';
import { Icon } from '../../components/icons';
import { PLATFORM_META } from '../../lib/constants';
import { formatCompactVnd, formatDecimal, formatVnd } from '../../lib/format';
import type { AdAccountOption, CampaignDetail } from '../../lib/types';
import { describeAdvice } from './campaign-insights';

const PARTS = [
  { key: 'performance', label: 'Hiệu quả', max: 50 },
  { key: 'runway', label: 'Hạn mức', max: 25 },
  { key: 'focus', label: 'Ít cạnh tranh', max: 15 },
  { key: 'maturity', label: 'Ổn định', max: 10 },
] as const;

/** Every ad account the campaign could run in, ranked by the server's advisor, with the reasons. */
export function AccountAdvisor({
  detail,
  canDuplicate,
  duplicating,
  onDuplicate,
}: {
  detail: CampaignDetail;
  canDuplicate: boolean;
  duplicating: string | null;
  onDuplicate: (account: AdAccountOption) => void;
}) {
  const { campaign, advice, accountCounts } = detail;
  const total = accountCounts.reduce((sum, c) => sum + c.total, 0);
  const summary = describeAdvice(advice.accounts);
  const duplicateBlocked = !campaign.creative
    ? 'Chiến dịch chưa có nội dung quảng cáo lưu trong AdHub'
    : !campaign.connected
      ? 'Nền tảng đang mất kết nối'
      : null;

  return (
    <section className="card overflow-hidden" aria-labelledby="accounts-title">
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
              <p className="text-2xs text-muted">trên {PLATFORM_META[campaign.platform].label}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface px-3.5 py-2 text-center">
              <p className="text-xl font-semibold tabular-nums">{total}</p>
              <p className="text-2xs text-muted">toàn workspace</p>
            </div>
          </div>
        </div>
        {accountCounts.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Số tài khoản theo nền tảng">
            {accountCounts.map((c) => (
              <li
                key={c.platform}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  c.platform === campaign.platform ? 'border-accent/30 bg-accent-soft' : 'border-line bg-surface'
                }`}
              >
                <PlatformTag platform={c.platform} compact />
                <span className="font-medium">{PLATFORM_META[c.platform].label}</span>
                <span className="tabular-nums text-muted">
                  {c.total} tài khoản{c.active < c.total && ` · ${c.total - c.active} bị khoá`}
                </span>
              </li>
            ))}
          </ul>
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

      {advice.accounts.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Chưa đọc được tài khoản quảng cáo" icon="plug">
            {PLATFORM_META[campaign.platform].label} đang mất kết nối. Kết nối lại trong mục Kết nối nền tảng để xem và so sánh tài khoản.
          </EmptyState>
        </div>
      ) : (
        <ol className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 2xl:grid-cols-3">
          {advice.accounts.map((account, index) => (
            <AccountCard
              key={account.id}
              rank={index + 1}
              account={account}
              action={
                canDuplicate && !account.current && account.fit.eligible
                  ? {
                      blocked: duplicateBlocked,
                      busy: duplicating === account.id,
                      onClick: () => onDuplicate(account),
                    }
                  : null
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function AccountCard({
  rank,
  account,
  action,
}: {
  rank: number;
  account: AdAccountOption;
  action: { blocked: string | null; busy: boolean; onClick: () => void } | null;
}) {
  const { fit, kpis } = account;
  const used = account.spendCap ? Math.min(1, (account.amountSpent ?? 0) / account.spendCap) : null;
  return (
    <li
      className={`relative flex flex-col rounded-2xl p-4 transition-shadow ${
        account.recommended ? 'card-ai shadow-glow' : 'border border-line bg-surface-raised hover:shadow-soft'
      } ${fit.eligible ? '' : 'opacity-70'}`}
    >
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

      {action && (
        <div className="mt-auto pt-4">
          <button
            type="button"
            className={`${account.recommended ? 'btn-ai' : 'btn-secondary'} btn-sm w-full`}
            disabled={Boolean(action.blocked) || action.busy}
            title={action.blocked ?? 'Tạo bản sao chiến dịch (cả nội dung) trong tài khoản này, ở trạng thái tạm dừng'}
            onClick={action.onClick}
          >
            <Icon name="copy" size={14} />
            {action.busy ? 'Đang nhân bản…' : account.recommended ? 'Nhân bản sang tài khoản đề xuất' : 'Nhân bản sang đây'}
          </button>
        </div>
      )}
    </li>
  );
}
