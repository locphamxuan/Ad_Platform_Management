import type { ReactNode } from 'react';
import { DATE_RANGE_OPTIONS, PLATFORM_META, type DateRangeDays } from '../lib/constants';
import type { CampaignStatus, Platform } from '../lib/types';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'positive' | 'negative' | 'caution' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted ring-line',
  positive: 'bg-positive-soft text-positive ring-positive/15',
  negative: 'bg-negative-soft text-negative ring-negative/15',
  caution: 'bg-caution-soft text-caution ring-caution/15',
  accent: 'bg-accent-soft text-accent ring-accent/15',
};

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** Brand color as a thin leading bar: identifies the channel without a logo. */
export function PlatformTag({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-ink" translate="no">
      <span aria-hidden className="h-3.5 w-1 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function StatusTag({ status }: { status: CampaignStatus }) {
  return status === 'ACTIVE' ? <Tag tone="positive">Đang chạy</Tag> : <Tag>Tạm dừng</Tag>;
}

export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-pad min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 truncate text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative">
      {error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'}
    </div>
  );
}

export function Loading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <p role="status" className="py-16 text-center text-sm text-muted">
      {label}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

/** Text-only toggle group; used for short filters instead of dropdowns. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`h-8 whitespace-nowrap rounded-md px-3 text-[0.8125rem] font-medium transition-colors duration-150 ${
              selected ? 'bg-ink text-white' : 'text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const DAY_OPTIONS = DATE_RANGE_OPTIONS.map((days) => ({ value: days, label: `${days} ngày` }));

export function DateRangePicker({ days, onChange }: { days: DateRangeDays; onChange: (days: DateRangeDays) => void }) {
  return <Segmented label="Khoảng thời gian" value={days} options={DAY_OPTIONS} onChange={onChange} />;
}
