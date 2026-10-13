import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { DATE_RANGE_OPTIONS, PLATFORM_META, type DateRangeDays } from '../lib/constants';
import { formatPercent } from '../lib/format';
import type { CampaignStatus, Platform } from '../lib/types';
import { Icon, type IconName } from './icons';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: IconName;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 max-w-2xl items-start gap-4">
        {icon && (
          <span className="mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ai-gradient text-white shadow-glow sm:flex">
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export type Tone = 'neutral' | 'positive' | 'negative' | 'caution' | 'accent' | 'ai';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-ink/5 text-muted ring-line',
  positive: 'bg-positive-soft text-positive ring-positive/20',
  negative: 'bg-negative-soft text-negative ring-negative/20',
  caution: 'bg-caution-soft text-caution ring-caution/20',
  accent: 'bg-accent-soft text-accent ring-accent/20',
  ai: 'bg-spark-soft text-spark ring-spark/20',
};

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** Marks content the assistant produced, so it is never mistaken for platform data. */
export function AiBadge({ label = 'AI gợi ý' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ai-gradient px-2 py-0.5 text-2xs font-semibold text-white">
      <Icon name="sparkles" size={11} />
      {label}
    </span>
  );
}

/** Initials on the brand gradient; decorative, the name is always shown next to it. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-ai-gradient font-semibold text-white ${
        size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
      }`}
    >
      {initials || '?'}
    </span>
  );
}

/** Brand color as a rounded monogram: identifies the channel without a third-party logo. */
export function PlatformTag({ platform, compact }: { platform: Platform; compact?: boolean }) {
  const meta = PLATFORM_META[platform];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-ink" translate="no">
      <span
        aria-hidden
        className="flex h-5 w-5 items-center justify-center rounded-md text-2xs font-bold text-white"
        style={{ background: meta.color }}
      >
        {meta.label.charAt(0)}
      </span>
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}

export function StatusTag({ status }: { status: CampaignStatus }) {
  return status === 'ACTIVE' ? (
    <Tag tone="positive">
      <span aria-hidden className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-positive" />
      Đang chạy
    </Tag>
  ) : (
    <Tag>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-subtle" />
      Tạm dừng
    </Tag>
  );
}

/** Change against the previous period; `inverse` for metrics where lower is better (CPA, CPC). */
export function Delta({ change, inverse }: { change: number | null; inverse?: boolean }) {
  if (change === null || !Number.isFinite(change)) return <span className="text-xs text-subtle">—</span>;
  const good = inverse ? change < 0 : change > 0;
  const flat = Math.abs(change) < 0.5;
  const tone = flat ? 'text-muted' : good ? 'text-positive' : 'text-negative';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {!flat && <Icon name={change > 0 ? 'trendUp' : 'trendDown'} size={13} />}
      {change > 0 ? '+' : ''}
      {formatPercent(change)}
      <span className="sr-only"> so với kỳ trước</span>
    </span>
  );
}

/** A tiny trend line drawn in SVG; no axes, just the shape of the period. */
export function Sparkline({ values, className = 'text-accent' }: { values: readonly number[]; className?: string }) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill="currentColor" opacity={0.12} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  change,
  inverse,
  trend,
  title,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number | null;
  inverse?: boolean;
  trend?: readonly number[];
  /** Full value on hover when `value` is abbreviated */
  title?: string;
}) {
  return (
    <div className="card-pad min-w-0 transition-shadow hover:shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {change !== undefined && <Delta change={change} inverse={inverse} />}
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tabular-nums tracking-tight text-ink" title={title ?? value}>
        {value}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
        {trend && <Sparkline values={trend} />}
      </div>
    </div>
  );
}

/** Health 0–100 as a ring; color follows the band so it reads at a glance. */
export function ScoreRing({ score, size = 40, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = score >= 70 ? 'text-positive' : score >= 45 ? 'text-caution' : 'text-negative';
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${tone}`} title={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className="absolute text-2xs font-bold tabular-nums">{score}</span>
      <span className="sr-only">{label ?? `Điểm ${score}/100`}</span>
    </span>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      {error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'}
    </div>
  );
}

/** Placeholder blocks in the shape of the content, instead of a bare "loading" line. */
export function Loading({ label = 'Đang tải dữ liệu…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" className="space-y-3 py-2">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, icon = 'sparkles' }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon name={icon} size={22} />
      </span>
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

/** "Select all" checkbox that also shows a partial selection. */
export function IndeterminateCheckbox({
  indeterminate,
  ...props
}: { indeterminate: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="h-4 w-4 rounded accent-accent" {...props} />;
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
    // Scrolls inside itself on narrow screens instead of widening the page.
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-ink/[0.03] p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`h-8 whitespace-nowrap rounded-[0.6rem] px-3 text-[0.8125rem] font-medium transition-all duration-150 ${
              selected ? 'bg-surface text-ink shadow-soft ring-1 ring-line' : 'text-muted hover:text-ink'
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
