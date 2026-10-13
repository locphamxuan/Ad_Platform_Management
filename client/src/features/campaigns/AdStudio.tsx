import { useState } from 'react';
import { AdPreview } from '../../components/AdPreview';
import { Icon } from '../../components/icons';
import { AiBadge, ScoreRing } from '../../components/ui';
import { PLATFORM_META } from '../../lib/constants';
import type { Campaign, Creative, Platform } from '../../lib/types';
import { reviewCreative } from '../create-campaign/brief';
import { suggestVariants, type CopyVariant } from './campaign-insights';

/** Suggestions shown at a time; "Đề xuất thêm" pages through the rest. */
const PAGE = 3;

export interface Launch {
  creative: Creative;
  /** True when the ad copy differs from what the campaign runs today */
  newCopy: boolean;
  platforms: Platform[];
}

/**
 * The ad as people will see it, with AI-written alternatives to try and every connected platform
 * to preview it on; the chosen version can then be launched on the chosen platforms in one go.
 */
export function AdStudio({
  campaign,
  creative,
  platformOptions,
  canLaunch,
  busy,
  onLaunch,
}: {
  campaign: Campaign;
  creative: Creative;
  platformOptions: readonly Platform[];
  canLaunch: boolean;
  busy: boolean;
  onLaunch: (launch: Launch) => void;
}) {
  const [variants] = useState(() => suggestVariants({ name: campaign.name, objective: campaign.objective, creative }));
  const [page, setPage] = useState(0);
  const [chosen, setChosen] = useState<CopyVariant | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([campaign.platform]);

  const pages = Math.max(1, Math.ceil(variants.length / PAGE));
  const shown = variants.slice(page * PAGE, page * PAGE + PAGE);
  const current = { ...creative, score: reviewCreative(creative).score };
  const active: Creative = chosen ?? creative;
  // The campaign already runs its own copy on its own platform, so that pair needs nothing new.
  const targets = platforms.filter((p) => chosen !== null || p !== campaign.platform);

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <p className="text-[0.9375rem] font-semibold">Phương án nội dung</p>
          <AiBadge label="AI đề xuất" />
          {variants.length > PAGE && (
            <button type="button" className="btn-ghost btn-sm ml-auto text-spark" onClick={() => setPage((p) => (p + 1) % pages)}>
              <Icon name="refresh" size={14} /> Đề xuất thêm
              <span className="tabular-nums text-subtle">
                {page + 1}/{pages}
              </span>
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label="Phương án nội dung" className="space-y-2 p-3">
          <VariantOption label="Đang chạy" variant={current} selected={chosen === null} onSelect={() => setChosen(null)} />
          {shown.map((v) => (
            <VariantOption
              key={v.headline + v.primaryText}
              label={v.angle}
              variant={v}
              best={v === variants[0] && v.score > current.score}
              selected={chosen === v}
              onSelect={() => setChosen(v)}
            />
          ))}
          {variants.length === 0 && <p className="px-1 text-xs text-muted">Chưa đủ thông tin để viết phương án khác.</p>}
        </div>
      </section>

      <AdPreview
        creative={active}
        platforms={platforms}
        objective={campaign.objective}
        platformOptions={platformOptions}
        onPlatformsChange={setPlatforms}
      />

      {canLaunch && (
        <section className="card-ai p-4">
          <p className="text-sm font-semibold">
            {chosen ? `Chạy phương án "${chosen.angle}"` : 'Chạy nội dung hiện tại'} trên{' '}
            {targets.length ? targets.map((p) => PLATFORM_META[p].label).join(', ') : '…'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Mỗi nền tảng tạo một chiến dịch tạm dừng ở tài khoản phù hợp nhất để bạn duyệt
            {chosen && platforms.includes(campaign.platform) ? `; trên ${PLATFORM_META[campaign.platform].label} đây là bản thử nghiệm A/B bên cạnh bản đang chạy` : ''}.
          </p>
          {targets.length === 0 && (
            <p className="mt-2 text-xs text-caution">Chọn một phương án mới hoặc bật thêm nền tảng ở phần xem trước.</p>
          )}
          <button
            type="button"
            className="btn-ai mt-3 w-full"
            disabled={busy || targets.length === 0}
            onClick={() => onLaunch({ creative: active, newCopy: chosen !== null, platforms: targets })}
          >
            <Icon name="send" size={15} />
            {busy ? 'Đang tạo…' : `Tạo trên ${targets.length} nền tảng`}
          </button>
        </section>
      )}
    </div>
  );
}

function VariantOption({
  label,
  variant,
  selected,
  best,
  onSelect,
}: {
  label: string;
  variant: Creative & { score: number };
  selected: boolean;
  best?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        selected ? 'border-accent bg-accent-soft shadow-glow' : 'border-line bg-surface-raised hover:border-accent/40'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-accent' : 'border-line-strong'}`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow text-spark">{label}</span>
          {best && <span className="rounded-full bg-positive-soft px-1.5 text-2xs font-semibold text-positive">Điểm cao nhất</span>}
        </span>
        <span className="mt-0.5 line-clamp-1 block text-sm font-semibold text-ink">{variant.headline}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{variant.primaryText}</span>
      </span>
      <ScoreRing score={variant.score} size={34} label={`Điểm nội dung ${variant.score}/100`} />
    </button>
  );
}
