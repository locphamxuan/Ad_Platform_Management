import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApplyRecommendations, type ApplyOutcome } from '../features/campaigns/use-apply-recommendations';
import type { Recommendation } from '../lib/insights';
import { Icon, type IconName } from './icons';
import { AiBadge, ErrorMessage, PlatformTag } from './ui';

const SEVERITY: Record<Recommendation['severity'], { icon: IconName; className: string; label: string }> = {
  high: { icon: 'alert', className: 'bg-negative-soft text-negative', label: 'Khẩn' },
  medium: { icon: 'gauge', className: 'bg-caution-soft text-caution', label: 'Nên làm' },
  low: { icon: 'trendUp', className: 'bg-positive-soft text-positive', label: 'Cơ hội' },
};

/** The assistant's to-do list: each item explains itself and applies in one click. */
export function RecommendationList({
  recommendations,
  canApply,
  limit,
  showAllLink,
}: {
  recommendations: readonly Recommendation[];
  canApply: boolean;
  limit?: number;
  showAllLink?: boolean;
}) {
  const apply = useApplyRecommendations();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const open = recommendations.filter((r) => !dismissed.has(r.id));
  const shown = limit ? open.slice(0, limit) : open;

  const run = (recs: readonly Recommendation[]) =>
    apply.mutate(recs, {
      onSuccess: (result) => {
        setOutcome(result);
        setDismissed((prev) => new Set([...prev, ...recs.map((r) => r.id)]));
      },
    });

  const applyAll = () => {
    if (confirm(`Áp dụng ${open.length} đề xuất? Thay đổi được gửi lên các nền tảng quảng cáo ngay.`)) run(open);
  };

  return (
    <section className="card-ai p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="section-title">Đề xuất tối ưu</h2>
            <AiBadge />
          </div>
          <p className="mt-1 text-xs text-muted">
            {open.length > 0
              ? `${open.length} việc nên làm, sắp theo mức độ khẩn — dựa trên ROAS, CPA và chi tiêu trong kỳ.`
              : 'Mọi chiến dịch đang trong ngưỡng an toàn. Trợ lý sẽ báo khi có thay đổi.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showAllLink && open.length > (limit ?? Infinity) && (
            <Link to="/campaigns" className="btn-ghost btn-sm">
              Xem tất cả
            </Link>
          )}
          {canApply && open.length > 1 && (
            <button type="button" className="btn-ai btn-sm" disabled={apply.isPending} onClick={applyAll}>
              <Icon name="wand" size={14} />
              {apply.isPending ? 'Đang áp dụng…' : `Áp dụng tất cả (${open.length})`}
            </button>
          )}
        </div>
      </div>

      <ErrorMessage error={apply.error} />
      {outcome && (
        <div role="status" className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-positive-soft px-4 py-3 text-sm text-positive">
          <div>
            <p className="font-medium">Đã áp dụng {outcome.applied} thay đổi.</p>
            {outcome.errors.map((e) => (
              <p key={e.campaignName} className="text-negative">
                {e.campaignName}: {e.message}
              </p>
            ))}
          </div>
          <button type="button" className="text-xs font-medium hover:underline" onClick={() => setOutcome(null)}>
            Đóng
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-positive-soft/60 px-4 py-3 text-sm text-positive">
          <Icon name="check" size={16} /> Không có việc cần xử lý.
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((rec) => {
            const meta = SEVERITY[rec.severity];
            return (
              <li
                key={rec.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-accent/30"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.className}`} title={meta.label}>
                  <Icon name={meta.icon} size={17} />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-ink">{rec.title}</p>
                  <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted">
                    <PlatformTag platform={rec.platform} compact />
                    <span className="max-w-[16rem] truncate font-medium text-ink-soft" title={rec.campaignName}>
                      {rec.campaignName}
                    </span>
                    <span>· {rec.reason}</span>
                  </p>
                </div>
                {/* Its own row on phones, beside the text from sm up. */}
                <div className="flex w-full items-center justify-between gap-3 pl-[3.25rem] sm:w-auto sm:pl-0">
                  <span className="text-xs font-medium text-accent">{rec.impact}</span>
                  {canApply && (
                    <div className="flex gap-1">
                      <button type="button" className="btn-primary btn-sm" disabled={apply.isPending} onClick={() => run([rec])}>
                        Áp dụng
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        aria-label={`Bỏ qua đề xuất cho ${rec.campaignName}`}
                        onClick={() => setDismissed((prev) => new Set([...prev, rec.id]))}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
