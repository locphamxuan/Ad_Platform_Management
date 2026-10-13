import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PLATFORM_META } from '../lib/constants';
import type { Creative, Objective, Platform } from '../lib/types';
import { Icon, type IconName } from './icons';

/**
 * How the ad reads in each placement it can run in, in the spirit of Ads Manager's preview:
 * pick a format (feed, vertical, horizontal) and every matching placement is drawn side by side.
 * The picture is a generated visual (headline on the brand gradient), since AdHub stores text only.
 */

type Format = 'feed' | 'vertical' | 'horizontal';
type PlacementId = 'facebook-feed' | 'instagram-feed' | 'stories' | 'tiktok' | 'google-search' | 'google-display';

interface Placement {
  id: PlacementId;
  label: string;
  format: Format;
  platform: Platform;
}

const PLACEMENTS: Placement[] = [
  { id: 'facebook-feed', label: 'Facebook · Bảng tin', format: 'feed', platform: 'facebook' },
  { id: 'instagram-feed', label: 'Instagram · Bảng tin', format: 'feed', platform: 'facebook' },
  { id: 'stories', label: 'Stories & Reels', format: 'vertical', platform: 'facebook' },
  { id: 'tiktok', label: 'TikTok · Dành cho bạn', format: 'vertical', platform: 'tiktok' },
  { id: 'google-search', label: 'Google · Tìm kiếm', format: 'horizontal', platform: 'google' },
  { id: 'google-display', label: 'Google · Mạng hiển thị', format: 'horizontal', platform: 'google' },
];

const FORMATS: { value: Format | 'all'; label: string; icon: IconName }[] = [
  { value: 'all', label: 'Tất cả vị trí', icon: 'layout' },
  { value: 'feed', label: 'Bảng tin', icon: 'square' },
  { value: 'vertical', label: 'Dọc (Stories, Reels, TikTok)', icon: 'phone' },
  { value: 'horizontal', label: 'Ngang (Tìm kiếm, Hiển thị)', icon: 'rectangle' },
];

/** The button text each objective is usually bought with. */
export const CTA_BY_OBJECTIVE: Record<Objective, string> = {
  sales: 'Mua ngay',
  leads: 'Đăng ký',
  traffic: 'Tìm hiểu thêm',
  awareness: 'Tìm hiểu thêm',
};

/** "https://www.shop-abc.vn/x" → { domain: "shop-abc.vn", name: "Shop-abc" }. */
export function brandFrom(landingUrl: string): { domain: string; name: string; path: string } {
  try {
    const url = new URL(landingUrl);
    const domain = url.hostname.replace(/^www\./, '');
    if (!domain.includes('.')) throw new Error('incomplete');
    const label = domain.split('.')[0];
    const path = url.pathname.split('/').filter(Boolean).slice(0, 2).join(' › ');
    return { domain, name: label.charAt(0).toUpperCase() + label.slice(1), path };
  } catch {
    return { domain: 'tenmien.vn', name: 'Thương hiệu của bạn', path: '' };
  }
}

export function placementsFor(platforms: readonly Platform[]): Placement[] {
  return PLACEMENTS.filter((p) => platforms.includes(p.platform));
}

interface PreviewProps {
  creative: Creative;
  objective?: Objective;
  cta: string;
  brand: ReturnType<typeof brandFrom>;
}

export function AdPreview({
  creative,
  platforms,
  objective,
  title = 'Xem trước quảng cáo',
  platformOptions,
  onPlatformsChange,
}: {
  creative: Creative;
  platforms: readonly Platform[];
  objective?: Objective;
  title?: string;
  /** With onPlatformsChange: the platforms the viewer may switch on and off (at least one stays on) */
  platformOptions?: readonly Platform[];
  /** Receives an updater, like a state setter, so quick successive toggles all count */
  onPlatformsChange?: (update: (current: Platform[]) => Platform[]) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [chosenFormat, setFormat] = useState<Format | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const available = placementsFor(platforms.length > 0 ? platforms : ['facebook']);
  const formats = FORMATS.filter((f) => f.value === 'all' || available.some((p) => p.format === f.value));
  // A format can disappear when platforms are switched off; fall back to showing everything.
  const format = formats.some((f) => f.value === chosenFormat) ? chosenFormat : 'all';
  const shown = available.filter((p) => format === 'all' || p.format === format);
  const props: PreviewProps = {
    creative,
    objective,
    cta: CTA_BY_OBJECTIVE[objective ?? 'traffic'],
    brand: brandFrom(creative.landingUrl),
  };

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          onClick={() => setVisible((v) => !v)}
          className="flex items-center gap-2.5 text-sm font-medium text-ink"
        >
          <span
            aria-hidden
            className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              visible ? 'justify-end bg-accent' : 'justify-start bg-line-strong'
            }`}
          >
            <span className="h-4 w-4 rounded-full bg-white shadow-soft" />
          </span>
          {title}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden text-2xs tabular-nums text-subtle sm:inline">{available.length} vị trí</span>
          <button type="button" className="btn-icon h-8 w-8" title="Phóng to" aria-label="Phóng to bản xem trước" onClick={() => setExpanded(true)}>
            <Icon name="maximize" size={15} />
          </button>
        </div>
      </div>
      {visible && (
        <>
          {platformOptions && onPlatformsChange && platformOptions.length > 1 && (
            <div role="group" aria-label="Nền tảng xem trước" className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted">Nền tảng</span>
              {platformOptions.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    disabled={on && platforms.length === 1}
                    onClick={() =>
                      onPlatformsChange((current) =>
                        current.includes(p) ? (current.length > 1 ? current.filter((x) => x !== p) : current) : [...current, p],
                      )
                    }
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed ${
                      on ? 'border-accent/40 bg-accent-soft text-ink' : 'border-line text-muted hover:border-accent/30 hover:text-ink'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded ${on ? 'text-white' : 'border border-line-strong'}`}
                      style={on ? { background: PLATFORM_META[p].color } : undefined}
                    >
                      {on && <Icon name="check" size={10} strokeWidth={3} />}
                    </span>
                    {PLATFORM_META[p].label}
                  </button>
                );
              })}
            </div>
          )}
          {formats.length > 2 && (
            <div role="group" aria-label="Định dạng vị trí" className="flex items-center gap-1 border-b border-line px-4 py-2">
              {formats.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={format === f.value}
                  title={f.label}
                  aria-label={f.label}
                  onClick={() => setFormat(f.value)}
                  className={`flex h-8 w-10 items-center justify-center rounded-lg transition-colors ${
                    format === f.value ? 'bg-accent-soft text-accent ring-1 ring-accent/25' : 'text-muted hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  <Icon name={f.icon} size={16} />
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1 text-2xs font-medium text-positive">
                <Icon name="check" size={13} /> Hợp lệ mọi vị trí
              </span>
            </div>
          )}
          <PlacementGrid placements={shown} {...props} />
        </>
      )}
      {/* Portalled: an animated (transformed) ancestor would otherwise trap position:fixed inside it. */}
      {expanded && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm sm:p-8"
          onClick={(event) => event.target === event.currentTarget && setExpanded(false)}
        >
          <div className="card w-full max-w-6xl animate-fade-up overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="section-title">{title} — {available.length} vị trí</p>
              <button type="button" className="btn-icon" aria-label="Đóng" onClick={() => setExpanded(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <PlacementGrid placements={available} wide {...props} />
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}

function PlacementGrid({ placements, wide, ...props }: PreviewProps & { placements: Placement[]; wide?: boolean }) {
  return (
    <div
      className={`grid items-start gap-4 bg-ink/[0.03] p-4 ${
        wide ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))]'
      }`}
    >
      {placements.map((placement) => (
        <figure key={placement.id} className="min-w-0">
          <figcaption className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: PLATFORM_META[placement.platform].color }} />
            {placement.label}
          </figcaption>
          <PlacementMock id={placement.id} {...props} />
        </figure>
      ))}
    </div>
  );
}

function PlacementMock({ id, ...props }: PreviewProps & { id: PlacementId }) {
  switch (id) {
    case 'facebook-feed':
      return <FacebookFeed {...props} />;
    case 'instagram-feed':
      return <InstagramFeed {...props} />;
    case 'stories':
      return <Stories {...props} />;
    case 'tiktok':
      return <TikTok {...props} />;
    case 'google-search':
      return <GoogleSearch {...props} />;
    case 'google-display':
      return <GoogleDisplay {...props} />;
  }
}

const placeholder = (value: string, fallback: string) => value.trim() || fallback;

function BrandAvatar({ name, size = 'h-8 w-8' }: { name: string; size?: string }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-ai-gradient text-xs font-bold text-white ${size}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** The generated picture: headline on a gradient, with soft shapes so it reads as an image. */
function Visual({ creative, brand, aspect, tall }: Pick<PreviewProps, 'creative' | 'brand'> & { aspect: string; tall?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-ai-gradient ${aspect}`} aria-hidden>
      <span className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" />
      <span className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/10" />
      <span className="absolute right-6 top-1/2 h-14 w-14 rotate-12 rounded-2xl bg-white/10" />
      {/* Vertical placements keep the bottom ~45% for the caption and button, like the real apps. */}
      <div className={`relative flex h-full flex-col p-4 text-white ${tall ? 'justify-center pb-[45%]' : 'justify-end'}`}>
        <span className="mb-2 w-fit rounded-full bg-white/20 px-2 py-0.5 text-[0.625rem] font-semibold backdrop-blur-sm">{brand.name}</span>
        <p className="line-clamp-3 text-base font-bold leading-snug drop-shadow-sm">{placeholder(creative.headline, 'Tiêu đề quảng cáo')}</p>
      </div>
    </div>
  );
}

function Frame({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border shadow-soft ${dark ? 'border-black bg-black text-white' : 'border-line bg-surface text-ink'}`}>
      {children}
    </div>
  );
}

function FacebookFeed({ creative, cta, brand }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2 p-3">
        <BrandAvatar name={brand.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{brand.name}</p>
          <p className="flex items-center gap-1 text-[0.625rem] text-muted">
            Được tài trợ · <Icon name="globe" size={10} />
          </p>
        </div>
        <Icon name="more" size={16} className="text-muted" strokeWidth={3} />
        <Icon name="x" size={14} className="text-muted" />
      </div>
      <p className="line-clamp-3 whitespace-pre-line px-3 pb-2.5 text-xs leading-relaxed">
        {placeholder(creative.primaryText, 'Nội dung chính hiển thị ở đây…')}
      </p>
      <Visual creative={creative} brand={brand} aspect="aspect-[1.91/1]" />
      <div className="flex items-center justify-between gap-2 bg-ink/[0.04] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[0.625rem] uppercase text-muted">{brand.domain}</p>
          <p className="truncate text-xs font-semibold">{placeholder(creative.headline, 'Tiêu đề quảng cáo')}</p>
        </div>
        <span className="shrink-0 rounded-md bg-ink/10 px-2.5 py-1.5 text-[0.6875rem] font-semibold">{cta}</span>
      </div>
      <div className="grid grid-cols-3 border-t border-line text-[0.6875rem] font-medium text-muted">
        {([['thumbUp', 'Thích'], ['message', 'Bình luận'], ['share', 'Chia sẻ']] as const).map(([icon, label]) => (
          <span key={label} className="flex items-center justify-center gap-1 py-2">
            <Icon name={icon} size={13} /> {label}
          </span>
        ))}
      </div>
    </Frame>
  );
}

function InstagramFeed({ creative, cta, brand }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
          <BrandAvatar name={brand.name} size="h-7 w-7 ring-2 ring-surface" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{brand.domain.split('.')[0]}</p>
          <p className="text-[0.625rem] text-muted">Được tài trợ</p>
        </div>
        <Icon name="more" size={16} className="text-muted" strokeWidth={3} />
      </div>
      <Visual creative={creative} brand={brand} aspect="aspect-square" />
      <div className="flex items-center justify-between border-b border-line bg-accent/90 px-3 py-2 text-xs font-semibold text-white">
        {cta}
        <Icon name="chevronRight" size={14} />
      </div>
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <Icon name="heart" size={17} />
        <Icon name="message" size={17} />
        <Icon name="send" size={17} />
        <Icon name="bookmark" size={17} className="ml-auto" />
      </div>
      <p className="line-clamp-2 px-3 pb-3 pt-1.5 text-xs leading-relaxed">
        <span className="font-semibold">{brand.domain.split('.')[0]}</span> {placeholder(creative.primaryText, 'Nội dung chính…')}
      </p>
    </Frame>
  );
}

function Stories({ creative, cta, brand }: PreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[240px]">
      <Frame dark>
        <div className="relative aspect-[9/16]">
          <div className="absolute inset-0">
            <Visual creative={creative} brand={brand} aspect="h-full" tall />
          </div>
          <div className="absolute inset-x-0 top-0 p-2.5">
            <div className="flex gap-1">
              <span className="h-0.5 flex-1 rounded-full bg-white" />
              <span className="h-0.5 flex-1 rounded-full bg-white/40" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <BrandAvatar name={brand.name} size="h-6 w-6" />
              <p className="text-[0.6875rem] font-semibold">{brand.name}</p>
              <p className="text-[0.625rem] text-white/75">Được tài trợ</p>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-4 pt-10">
            <p className="line-clamp-2 text-center text-[0.6875rem] text-white/90">{placeholder(creative.primaryText, 'Nội dung chính…')}</p>
            <Icon name="chevronDown" size={14} className="rotate-180" />
            <span className="rounded-full bg-white px-4 py-1.5 text-[0.6875rem] font-semibold text-black">{cta}</span>
          </div>
        </div>
      </Frame>
    </div>
  );
}

function TikTok({ creative, cta, brand }: PreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[240px]">
      <Frame dark>
        <div className="relative aspect-[9/16]">
          <div className="absolute inset-0">
            <Visual creative={creative} brand={brand} aspect="h-full" tall />
          </div>
          <p className="absolute inset-x-0 top-3 text-center text-[0.6875rem] font-semibold text-white/90">
            Đang theo dõi <span className="mx-1 text-white/50">|</span> <span className="border-b-2 border-white pb-0.5">Dành cho bạn</span>
          </p>
          <div className="absolute bottom-24 right-2 flex flex-col items-center gap-3 text-[0.625rem]">
            <BrandAvatar name={brand.name} size="h-8 w-8 ring-2 ring-white" />
            {(['heart', 'message', 'bookmark', 'share'] as const).map((icon) => (
              <span key={icon} className="flex flex-col items-center gap-0.5">
                <Icon name={icon} size={20} />
              </span>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10">
            <p className="text-xs font-semibold">@{brand.domain.split('.')[0]}</p>
            <p className="line-clamp-2 pr-10 text-[0.6875rem] text-white/90">{placeholder(creative.primaryText, 'Nội dung chính…')}</p>
            <p className="flex items-center gap-1 text-[0.625rem] text-white/80">
              <Icon name="music" size={11} /> Được tài trợ · Âm thanh gốc
            </p>
            <span className="block rounded-md bg-[#FE2C55] py-1.5 text-center text-[0.6875rem] font-semibold">{cta}</span>
          </div>
        </div>
      </Frame>
    </div>
  );
}

function GoogleSearch({ creative, brand }: PreviewProps) {
  return (
    <Frame>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[0.6875rem] text-muted">
          <Icon name="search" size={12} />
          <span className="truncate">{brand.name.toLowerCase()}</span>
        </div>
        <div className="pt-1">
          <p className="text-[0.6875rem] font-bold">Được tài trợ</p>
          <div className="mt-1 flex items-center gap-2">
            <BrandAvatar name={brand.name} size="h-6 w-6" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[0.6875rem] font-medium">{brand.name}</p>
              <p className="truncate text-[0.625rem] text-muted">
                https://{brand.domain}
                {brand.path && ` › ${brand.path}`}
              </p>
            </div>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
            {placeholder(creative.headline, 'Tiêu đề quảng cáo')} | {brand.name}
          </p>
          <p className="mt-1 line-clamp-3 text-[0.6875rem] leading-relaxed text-ink-soft">
            {placeholder(creative.primaryText, 'Mô tả hiển thị dưới tiêu đề…')}
          </p>
        </div>
      </div>
    </Frame>
  );
}

function GoogleDisplay({ creative, cta, brand }: PreviewProps) {
  return (
    <Frame>
      <div className="grid grid-cols-[42%_1fr]">
        <Visual creative={{ ...creative, headline: '' }} brand={brand} aspect="h-full min-h-[132px]" />
        <div className="flex min-w-0 flex-col gap-1.5 p-3">
          <p className="line-clamp-2 text-xs font-semibold leading-snug">{placeholder(creative.headline, 'Tiêu đề quảng cáo')}</p>
          <p className="line-clamp-2 text-[0.6875rem] text-muted">{placeholder(creative.primaryText, 'Mô tả ngắn…')}</p>
          <div className="mt-auto flex items-center justify-between gap-2">
            <span className="truncate text-[0.625rem] text-subtle">{brand.domain}</span>
            <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[0.625rem] font-semibold text-white">{cta}</span>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-1 border-t border-line px-3 py-1 text-[0.5625rem] text-subtle">
        <Icon name="info" size={10} /> Quảng cáo
      </p>
    </Frame>
  );
}
