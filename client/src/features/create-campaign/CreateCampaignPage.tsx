import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/icons';
import { AiBadge, ErrorMessage, Field, PageHeader, PlatformTag, ScoreRing, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { allocateBudget, rebalance, splitEvenly } from '../../lib/budget';
import { BUDGET_STEP, OBJECTIVE_LABELS, PLATFORM_META, PLATFORMS } from '../../lib/constants';
import { formatDecimal, formatVnd, lastNDays } from '../../lib/format';
import { suggestAllocation } from '../../lib/insights';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import type { CreateUnifiedCampaignInput, Objective, Platform, PlatformPublishResult } from '../../lib/types';
import { useTextParam } from '../../lib/url-state';
import { suggestCampaign, TEMPLATES } from './autofill';
import {
  campaignNameFor,
  generateCreatives,
  parseBrief,
  reviewCreative,
  slugify,
  withUtm,
  type CreativeVariant,
} from './brief';

/** Selected platforms and their share of the total; a platform is selected when it has a key. */
type Shares = Partial<Record<Platform, number>>;

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
/** How far back the smart split looks at each platform's ROAS. */
const PERFORMANCE_DAYS = 30;

/** One example per kind of advertiser: AdHub is not tied to any industry. */
const BRIEF_EXAMPLES = [
  'Giảm 30% gói chăm sóc da dịp 20/10, ngân sách 2 triệu/ngày',
  'Thu thập đăng ký tư vấn khoá học IELTS, 1 triệu/ngày',
  'Ra mắt ứng dụng đặt lịch khám, ngân sách 3tr',
  'Tăng nhận diện thương hiệu cá nhân kênh nấu ăn, 500k/ngày',
];

const pad = (n: number) => String(n).padStart(2, '0');

const isWebUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol) && new URL(value).hostname.includes('.');
  } catch {
    return false;
  }
};

export function CreateCampaignPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });
  const performanceRange = lastNDays(PERFORMANCE_DAYS);
  const performance = useQuery({
    queryKey: queryKeys.dashboard(performanceRange.from, performanceRange.to),
    queryFn: () => api.dashboard.summary(performanceRange),
  });
  const [briefParam] = useTextParam('brief');
  const [briefText, setBriefText] = useState(briefParam);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState<Objective>('sales');
  const [totalDailyBudget, setTotalDailyBudget] = useState(1_000_000);
  // null = untouched: follow the default below, which waits for the integration list.
  const [chosenShares, setShares] = useState<Shares | null>(null);
  const [creative, setCreative] = useState({ headline: '', primaryText: '', landingUrl: 'https://' });
  const [variants, setVariants] = useState<CreativeVariant[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // Random first template so repeated demos differ; each autofill then cycles through the rest.
  const [nextTemplate, setNextTemplate] = useState(() => Math.floor(Math.random() * TEMPLATES.length));

  const create = useMutation({
    mutationFn: (input: CreateUnifiedCampaignInput) => api.campaigns.createUnified(input),
    onSuccess: () => invalidateCampaignViews(queryClient),
  });

  const connected = new Set(integrations.data?.filter((i) => i.connected).map((i) => i.platform));
  const minBudget = new Map(integrations.data?.map((i) => [i.platform, i.minDailyBudget]));
  const limit = user?.dailyBudgetLimit ?? null;
  const roasByPlatform = new Map(
    performance.data?.byPlatform.filter((p) => p.kpis.spend > 0).map((p) => [p.platform, p.kpis.roas]),
  );

  // Start with every connected platform, split evenly, so most campaigns need no clicks here at all.
  const connectedPlatforms = PLATFORMS.filter((p) => connected.has(p));
  const defaultPlatforms = connectedPlatforms.length > 0 ? connectedPlatforms : PLATFORMS;
  const shares = chosenShares ?? splitEvenly(defaultPlatforms);
  const selected = PLATFORMS.filter((p) => shares[p] !== undefined);
  const percentOf = (p: Platform) => shares[p] ?? 0;
  const percentSum = selected.reduce((sum, p) => sum + percentOf(p), 0);
  const budgets = new Map(
    allocateBudget(
      totalDailyBudget,
      selected.map((platform) => ({ platform, percent: percentOf(platform) })),
    ).map((a) => [a.platform, a.dailyBudget]),
  );

  // The server rejects the whole request for these, so block them here with a clear reason.
  const allocationProblem =
    selected.length === 0
      ? 'Chọn ít nhất một nền tảng.'
      : percentSum !== 100
        ? 'Tỉ lệ phân bổ của các nền tảng đã chọn phải bằng đúng 100%.'
        : selected.some((p) => percentOf(p) <= 0)
          ? 'Mỗi nền tảng đã chọn cần tỉ lệ lớn hơn 0%; bỏ chọn nền tảng không dùng.'
          : limit !== null && selected.some((p) => (budgets.get(p) ?? 0) > limit)
            ? `Mỗi kênh tối đa ${formatVnd(limit)}/ngày theo hạn mức của bạn.`
            : null;
  const isAllocationValid = allocationProblem === null;
  const review = reviewCreative(creative);

  /** Adding or removing a platform re-splits evenly; fine-tune afterwards if needed. */
  const togglePlatform = (platform: Platform) =>
    setShares(splitEvenly(PLATFORMS.filter((p) => (p === platform ? shares[p] === undefined : shares[p] !== undefined))));
  const setPercent = (platform: Platform, percent: number) => setShares(rebalance(shares, platform, percent));

  /** Fills every field with a ready-to-submit campaign; each click moves on to the next template. */
  const autofill = () => {
    const draft = suggestCampaign({ index: nextTemplate, now: new Date(), platforms: defaultPlatforms, minBudget, limit });
    setName(draft.name);
    setObjective(draft.objective);
    setTotalDailyBudget(draft.totalDailyBudget);
    setCreative(draft.creative);
    setVariants([]);
    setShares(null);
    setAiNote(null);
    create.reset();
    setNextTemplate((index) => index + 1);
  };

  /** Reads the one-line brief and drafts the whole campaign from it. */
  const draftFromBrief = (text: string) => {
    if (!text.trim()) return;
    const brief = parseBrief(text);
    const now = new Date();
    const slug = `${slugify(brief.occasion ?? brief.product)}-${pad(now.getDate())}${pad(now.getMonth() + 1)}`;
    const generated = generateCreatives(brief);
    // Money follows results when there is history to go on; otherwise the even default stays.
    const smart = roasByPlatform.size > 0 && defaultPlatforms.length > 1;
    setName(campaignNameFor(brief, now));
    setObjective(brief.objective);
    if (brief.totalDailyBudget) setTotalDailyBudget(brief.totalDailyBudget);
    setVariants(generated);
    // The advertiser's own site: from the brief, else whatever valid link is already in the field.
    const site = brief.landingUrl ?? (isWebUrl(creative.landingUrl) ? creative.landingUrl : null);
    setCreative({
      headline: generated[0].headline,
      primaryText: generated[0].primaryText,
      landingUrl: site ? withUtm(site, slug) : 'https://',
    });
    setShares(smart ? suggestAllocation(defaultPlatforms, roasByPlatform) : null);
    setAiNote(
      [
        `Mục tiêu: ${OBJECTIVE_LABELS[brief.objective]}`,
        brief.totalDailyBudget ? `ngân sách ${formatVnd(brief.totalDailyBudget)}/ngày` : 'giữ ngân sách hiện tại',
        smart ? `chia kênh theo ROAS ${PERFORMANCE_DAYS} ngày` : 'chia đều các kênh',
        site ? 'gắn UTM vào link của bạn' : 'nhập link đích của bạn, UTM sẽ tự gắn',
      ].join(' · '),
    );
    create.reset();
  };

  // A brief handed over from the assistant box (?brief=…) is drafted once, when the data it needs is in.
  const draftedFromUrl = useRef(false);
  useEffect(() => {
    if (draftedFromUrl.current || !briefParam || !integrations.isFetched || !performance.isFetched) return;
    draftedFromUrl.current = true;
    draftFromBrief(briefParam);
    // draftFromBrief reads the latest render's data on purpose; it is not a dependency.
  }, [briefParam, integrations.isFetched, performance.isFetched]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      name,
      objective,
      totalDailyBudget,
      allocations: selected.map((platform) => ({ platform, percent: percentOf(platform) })),
      creative,
    });
  };

  const rewriteCopy = () => {
    const generated = generateCreatives({ ...parseBrief(briefText.trim() || name), objective });
    setVariants(generated);
    setCreative((c) => ({ ...c, headline: generated[0].headline, primaryText: generated[0].primaryText }));
  };

  return (
    <>
      <PageHeader
        icon="wand"
        eyebrow="Tạo một lần, chạy mọi kênh"
        title="Tạo chiến dịch đa kênh"
        description="Mô tả chiến dịch bằng một câu, trợ lý soạn phần còn lại. AdHub tạo trên từng nền tảng ở trạng thái Tạm dừng để bạn kiểm tra trước khi chạy."
        actions={
          <button type="button" className="btn-secondary" onClick={autofill}>
            <Icon name="refresh" size={15} />
            Tự điền mẫu
          </button>
        }
      />

      <section className="card-ai mb-6 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Mô tả chiến dịch của bạn</p>
          <AiBadge label="Trợ lý soạn" />
        </div>
        <p className="mt-1 text-xs text-muted">
          Nêu sản phẩm, ưu đãi, dịp và ngân sách — có dấu hay không dấu đều được. Ctrl+Enter để soạn.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <textarea
            className="input min-h-[52px] flex-1 resize-y"
            rows={2}
            aria-label="Mô tả chiến dịch"
            placeholder={BRIEF_EXAMPLES[0]}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) draftFromBrief(briefText);
            }}
          />
          <button
            type="button"
            className="btn-ai h-auto min-h-[52px] px-5"
            disabled={!briefText.trim()}
            onClick={() => draftFromBrief(briefText)}
          >
            <Icon name="sparkles" size={16} />
            Soạn bằng AI
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BRIEF_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-full border border-line bg-surface-raised px-3 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-ink"
              onClick={() => {
                setBriefText(example);
                draftFromBrief(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
        {aiNote && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-spark-soft px-3 py-2 text-sm text-ink-soft">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-spark" />
            Đã soạn xong — {aiNote}. Kiểm tra lại bên dưới rồi bấm tạo.
          </p>
        )}
      </section>

      <form onSubmit={onSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Step number="01" title="Thông tin chiến dịch">
            <Field label="Tên chiến dịch">
              <input
                className="input"
                name="name"
                required
                minLength={3}
                maxLength={120}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Sale 11.11 – BST mùa đông"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mục tiêu">
                <select className="input" value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
                  {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Tổng ngân sách mỗi ngày (VND)"
                hint={user?.dailyBudgetLimit ? `Mỗi kênh tối đa ${formatVnd(user.dailyBudgetLimit)}/ngày` : undefined}
              >
                <input
                  className="input tabular-nums"
                  type="number"
                  inputMode="numeric"
                  min={BUDGET_STEP}
                  step={BUDGET_STEP}
                  required
                  value={totalDailyBudget}
                  onChange={(e) => setTotalDailyBudget(Number(e.target.value))}
                />
              </Field>
            </div>
            <div role="group" aria-label="Chọn nhanh tổng ngân sách" className="flex flex-wrap gap-2">
              {BUDGET_PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={totalDailyBudget === amount}
                  className={`${totalDailyBudget === amount ? 'btn-primary' : 'btn-secondary'} btn-sm tabular-nums`}
                  onClick={() => setTotalDailyBudget(amount)}
                >
                  {formatVnd(amount)}
                </button>
              ))}
            </div>
          </Step>

          <Step
            number="02"
            title="Chọn nền tảng và chia ngân sách"
            aside={
              <Tag tone={percentSum === 100 ? 'positive' : 'negative'}>
                <span className="tabular-nums">Tổng {percentSum}%</span>
              </Tag>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-ai btn-sm"
                disabled={selected.length < 2 || roasByPlatform.size === 0}
                title={roasByPlatform.size === 0 ? 'Chưa có số liệu ROAS để phân bổ' : undefined}
                onClick={() => setShares(suggestAllocation(selected, roasByPlatform))}
              >
                <Icon name="sparkles" size={14} />
                Phân bổ thông minh theo ROAS
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={selected.length < 2}
                onClick={() => setShares(splitEvenly(selected))}
              >
                Chia đều
              </button>
              <p className="text-xs text-muted">Bấm nền tảng để chọn/bỏ. Sửa tỉ lệ một kênh, các kênh còn lại tự cân về 100%.</p>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {PLATFORMS.map((platform) => {
                const enabled = shares[platform] !== undefined;
                const percent = percentOf(platform);
                const budget = budgets.get(platform) ?? 0;
                const min = minBudget.get(platform);
                const roas = roasByPlatform.get(platform);
                // Only this channel fails on the server; the others are still created.
                const belowMin = enabled && percent > 0 && min !== undefined && budget < min;
                return (
                  <li
                    key={platform}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors ${
                      enabled ? 'bg-surface' : 'bg-ink/[0.02]'
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={enabled}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left"
                      onClick={() => togglePlatform(platform)}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                          enabled ? 'justify-end bg-accent' : 'justify-start bg-line-strong'
                        }`}
                      >
                        <span className="h-4 w-4 rounded-full bg-white shadow-soft" />
                      </span>
                      <PlatformTag platform={platform} />
                      {roas !== undefined && <span className="text-xs tabular-nums text-muted">ROAS {formatDecimal(roas)}x</span>}
                      {integrations.data && !connected.has(platform) && <Tag tone="caution">Chưa kết nối</Tag>}
                      {belowMin && <Tag tone="caution">Tối thiểu {formatVnd(min)}/ngày</Tag>}
                    </button>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`Tỉ lệ ngân sách cho ${PLATFORM_META[platform].label} (%)`}
                        className="input h-9 w-20 text-right tabular-nums"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        disabled={!enabled || selected.length < 2}
                        value={percent}
                        onChange={(e) => setPercent(platform, Number(e.target.value))}
                      />
                      <span className="text-sm text-muted">%</span>
                      <span className="w-28 text-right text-sm font-medium tabular-nums">{enabled ? formatVnd(budget) : '—'}</span>
                    </div>
                    {enabled && (
                      <div className="h-1 w-full overflow-hidden rounded-full bg-ink/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, background: PLATFORM_META[platform].color }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Step>

          <Step
            number="03"
            title="Nội dung quảng cáo"
            aside={
              <button
                type="button"
                className="btn-ghost btn-sm text-spark"
                disabled={!name.trim() && !briefText.trim()}
                onClick={rewriteCopy}
              >
                <Icon name="sparkles" size={14} />
                Viết bằng AI
              </button>
            }
          >
            {variants.length > 0 && (
              <div role="radiogroup" aria-label="Phương án nội dung" className="grid gap-2 sm:grid-cols-3">
                {variants.map((v) => {
                  const active = v.headline === creative.headline && v.primaryText === creative.primaryText;
                  return (
                    <button
                      key={v.angle}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setCreative({ ...creative, headline: v.headline, primaryText: v.primaryText })}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        active ? 'border-accent bg-accent-soft shadow-glow' : 'border-line bg-surface-raised hover:border-accent/40'
                      }`}
                    >
                      <span className="eyebrow text-spark">{v.angle}</span>
                      <span className="mt-1 line-clamp-2 block text-sm font-semibold text-ink">{v.headline}</span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted">{v.primaryText}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <Field label="Tiêu đề" hint={`${creative.headline.length}/100 ký tự`}>
              <input
                className="input"
                required
                maxLength={100}
                autoComplete="off"
                value={creative.headline}
                onChange={(e) => setCreative({ ...creative, headline: e.target.value })}
              />
            </Field>
            <Field label="Nội dung chính" hint={`${creative.primaryText.length}/500 ký tự`}>
              <textarea
                className="input"
                rows={4}
                required
                maxLength={500}
                value={creative.primaryText}
                onChange={(e) => setCreative({ ...creative, primaryText: e.target.value })}
              />
            </Field>
            <Field label="Link đích" hint="Trang của bạn; UTM được gắn tự động khi rời ô để đo nguồn chuyển đổi">
              <input
                className="input"
                type="url"
                inputMode="url"
                spellCheck={false}
                required
                value={creative.landingUrl}
                onChange={(e) => setCreative({ ...creative, landingUrl: e.target.value })}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (isWebUrl(value)) setCreative((c) => ({ ...c, landingUrl: withUtm(value, slugify(name || 'chien-dich')) }));
                }}
              />
            </Field>
            <div className="flex items-start gap-4 rounded-xl border border-line bg-surface-raised p-4">
              <ScoreRing score={review.score} size={48} label={`Điểm nội dung ${review.score}/100`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Chất lượng nội dung: {review.score >= 80 ? 'rất tốt' : review.score >= 55 ? 'khá' : 'cần cải thiện'}
                </p>
                {review.tips.length === 0 ? (
                  <p className="mt-0.5 text-xs text-muted">Nội dung đã đủ các yếu tố quan trọng.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {review.tips.slice(0, 3).map((tip) => (
                      <li key={tip}>• {tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Step>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <AdPreview creative={creative} />
          <div className="card-pad space-y-4">
            <p className="eyebrow">Xác nhận</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Số chiến dịch</dt>
                <dd className="font-medium tabular-nums">{selected.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Tổng mỗi ngày</dt>
                <dd className="font-medium tabular-nums">{formatVnd(totalDailyBudget)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Dự kiến 30 ngày</dt>
                <dd className="font-medium tabular-nums">{formatVnd(totalDailyBudget * 30)}</dd>
              </div>
            </dl>
            {allocationProblem && <p className="text-sm text-negative">{allocationProblem}</p>}
            <button type="submit" className="btn-primary h-11 w-full" disabled={!isAllocationValid || create.isPending}>
              <Icon name="send" size={16} />
              {create.isPending ? 'Đang tạo…' : 'Tạo trên các nền tảng đã chọn'}
            </button>
            <ErrorMessage error={create.error} />
          </div>
          {create.data && <PublishResults results={create.data.results} />}
        </aside>
      </form>
    </>
  );
}

function Step({ number, title, aside, children }: { number: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card-pad">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-bold tabular-nums text-accent">
            {number}
          </span>
          <span className="section-title">{title}</span>
        </h2>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** How the ad reads in a feed, updated as the fields change. */
function AdPreview({ creative }: { creative: CreateUnifiedCampaignInput['creative'] }) {
  let domain = '';
  try {
    domain = new URL(creative.landingUrl).hostname;
  } catch {
    // Still being typed; show the placeholder domain.
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="eyebrow flex items-center gap-1.5">
          <Icon name="eye" size={13} /> Xem trước
        </p>
        <span className="text-2xs text-subtle">Bảng tin di động</span>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-full bg-ai-gradient" aria-hidden />
          <div>
            <p className="text-sm font-semibold leading-tight">Thương hiệu của bạn</p>
            <p className="text-2xs text-muted">Được tài trợ</p>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{creative.primaryText || 'Nội dung chính hiển thị ở đây…'}</p>
      </div>
      <div className="aspect-[1.91/1] bg-ai-gradient opacity-90" aria-hidden />
      <div className="flex items-center justify-between gap-3 bg-ink/[0.03] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-2xs uppercase text-muted">{domain || 'tenmien.vn'}</p>
          <p className="truncate text-sm font-semibold">{creative.headline || 'Tiêu đề quảng cáo'}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-ink/10 px-3 py-1.5 text-xs font-semibold">Tìm hiểu thêm</span>
      </div>
    </div>
  );
}

function PublishResults({ results }: { results: PlatformPublishResult[] }) {
  return (
    <div className="card-pad animate-fade-up space-y-3" aria-live="polite">
      <p className="eyebrow">Kết quả</p>
      <ul className="space-y-3">
        {results.map((r) => (
          <li key={r.platform} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <PlatformTag platform={r.platform} />
              {r.success ? <Tag tone="positive">Đã tạo</Tag> : <Tag tone="negative">Thất bại</Tag>}
            </div>
            <p className={`text-xs ${r.success ? 'text-muted' : 'text-negative'}`}>
              {r.success ? `${formatVnd(r.campaign.dailyBudget)}/ngày · ${r.campaign.platformObjective}` : r.error}
            </p>
          </li>
        ))}
      </ul>
      <Link to="/campaigns" className="btn-secondary w-full">
        Xem danh sách chiến dịch
      </Link>
    </div>
  );
}
