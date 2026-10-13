import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErrorMessage, Field, PageHeader, PlatformTag, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { allocateBudget, rebalance, splitEvenly } from '../../lib/budget';
import { BUDGET_STEP, OBJECTIVE_LABELS, PLATFORM_META, PLATFORMS } from '../../lib/constants';
import { formatVnd } from '../../lib/format';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import type { CreateUnifiedCampaignInput, Objective, Platform, PlatformPublishResult } from '../../lib/types';
import { suggestCampaign, TEMPLATES } from './autofill';

/** Selected platforms and their share of the total; a platform is selected when it has a key. */
type Shares = Partial<Record<Platform, number>>;

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

export function CreateCampaignPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });
  const [name, setName] = useState('');
  const [objective, setObjective] = useState<Objective>('sales');
  const [totalDailyBudget, setTotalDailyBudget] = useState(1_000_000);
  // null = untouched: follow the default below, which waits for the integration list.
  const [chosenShares, setShares] = useState<Shares | null>(null);
  const [creative, setCreative] = useState({ headline: '', primaryText: '', landingUrl: 'https://' });
  // Random first template so repeated demos differ; each autofill then cycles through the rest.
  const [nextTemplate, setNextTemplate] = useState(() => Math.floor(Math.random() * TEMPLATES.length));

  const create = useMutation({
    mutationFn: (input: CreateUnifiedCampaignInput) => api.campaigns.createUnified(input),
    onSuccess: () => invalidateCampaignViews(queryClient),
  });

  const connected = new Set(integrations.data?.filter((i) => i.connected).map((i) => i.platform));
  const minBudget = new Map(integrations.data?.map((i) => [i.platform, i.minDailyBudget]));
  const limit = user?.dailyBudgetLimit ?? null;

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
    setShares(null);
    create.reset();
    setNextTemplate((index) => index + 1);
  };

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

  return (
    <>
      <PageHeader
        eyebrow="Tạo một lần, chạy mọi kênh"
        title="Tạo chiến dịch đa kênh"
        description="AdHub tạo chiến dịch trên từng nền tảng ở trạng thái Tạm dừng để bạn kiểm tra trước khi chạy."
        actions={
          <button type="button" className="btn-secondary" onClick={autofill}>
            Tự điền mẫu
          </button>
        }
      />
      <form onSubmit={onSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-accent underline-offset-4 hover:underline disabled:opacity-40"
                  disabled={selected.length < 2}
                  onClick={() => setShares(splitEvenly(selected))}
                >
                  Chia đều
                </button>
                <Tag tone={percentSum === 100 ? 'positive' : 'negative'}>
                  <span className="tabular-nums">Tổng {percentSum}%</span>
                </Tag>
              </div>
            }
          >
            <p className="text-xs text-muted">
              Bấm vào nền tảng để chọn hoặc bỏ. Sửa tỉ lệ một kênh, các kênh còn lại tự cân để tổng luôn là 100%.
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {PLATFORMS.map((platform) => {
                const enabled = shares[platform] !== undefined;
                const percent = percentOf(platform);
                const budget = budgets.get(platform) ?? 0;
                const min = minBudget.get(platform);
                // Only this channel fails on the server; the others are still created.
                const belowMin = enabled && percent > 0 && min !== undefined && budget < min;
                return (
                  <li
                    key={platform}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${enabled ? '' : 'bg-canvas/60'}`}
                  >
                    <button
                      type="button"
                      aria-pressed={enabled}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => togglePlatform(platform)}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                          enabled ? 'justify-end bg-ink' : 'justify-start bg-line-strong'
                        }`}
                      >
                        <span className="h-4 w-4 rounded-full bg-white" />
                      </span>
                      <PlatformTag platform={platform} />
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
                      <span className="w-28 text-right text-sm font-medium tabular-nums">
                        {enabled ? formatVnd(budget) : '—'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Step>

          <Step number="03" title="Nội dung quảng cáo">
            <Field label="Tiêu đề" hint="Tối đa 100 ký tự">
              <input
                className="input"
                required
                maxLength={100}
                autoComplete="off"
                value={creative.headline}
                onChange={(e) => setCreative({ ...creative, headline: e.target.value })}
              />
            </Field>
            <Field label="Nội dung chính" hint="Tối đa 500 ký tự">
              <textarea
                className="input"
                rows={4}
                required
                maxLength={500}
                value={creative.primaryText}
                onChange={(e) => setCreative({ ...creative, primaryText: e.target.value })}
              />
            </Field>
            <Field label="Link đích">
              <input
                className="input"
                type="url"
                inputMode="url"
                spellCheck={false}
                required
                value={creative.landingUrl}
                onChange={(e) => setCreative({ ...creative, landingUrl: e.target.value })}
              />
            </Field>
          </Step>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-10">
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
            </dl>
            {allocationProblem && <p className="text-sm text-negative">{allocationProblem}</p>}
            <button type="submit" className="btn-primary h-10 w-full" disabled={!isAllocationValid || create.isPending}>
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
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-3">
          <span className="text-xs font-semibold tabular-nums text-accent">{number}</span>
          <span className="section-title">{title}</span>
        </h2>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PublishResults({ results }: { results: PlatformPublishResult[] }) {
  return (
    <div className="card-pad space-y-3" aria-live="polite">
      <p className="eyebrow">Kết quả</p>
      <ul className="space-y-3">
        {results.map((r) => (
          <li key={r.platform} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <PlatformTag platform={r.platform} />
              {r.success ? <Tag tone="positive">Đã tạo</Tag> : <Tag tone="negative">Thất bại</Tag>}
            </div>
            <p className={`text-xs ${r.success ? 'text-muted' : 'text-negative'}`}>
              {r.success
                ? `${formatVnd(r.campaign.dailyBudget)}/ngày · ${r.campaign.platformObjective}`
                : r.error}
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
