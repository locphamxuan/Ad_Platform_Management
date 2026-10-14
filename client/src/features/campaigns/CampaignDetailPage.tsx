import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon, type IconName } from '../../components/icons';
import {
  AiBadge,
  DateRangePicker,
  EmptyState,
  ErrorMessage,
  KpiCard,
  Loading,
  PlatformTag,
  ScoreRing,
  Segmented,
  StatusTag,
  Tag,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { OBJECTIVE_LABELS, PLATFORM_META } from '../../lib/constants';
import { formatCompactVnd, formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent, formatVnd } from '../../lib/format';
import { percentChange, recommend, typicalCpa, type Recommendation } from '../../lib/insights';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import { useChartColors } from '../../lib/theme';
import type { AdAccountOption, Campaign, CampaignDetail, CampaignStatus, CopyOptions, CopyResult, Kpis } from '../../lib/types';
import { useDateRangeParam } from '../../lib/url-state';
import { metaAdsManagerUrl, metaPageAdsCenterUrl } from '../../lib/ads-manager';
import { describeSchedule } from '../../lib/schedule';
import { reviewCreative } from '../create-campaign/brief';
import { AccountAdvisor, type AccountChoice } from './AccountAdvisor';
import { AdStudio, type Launch } from './AdStudio';
import { BudgetEditor } from './BudgetEditor';
import { ctaAdvice, summarizeCampaign } from './campaign-insights';
import { useApplyRecommendations } from './use-apply-recommendations';

/** One campaign in full: results over time, the ad as people see it, and where it should run. */
export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const { days, setDays, range } = useDateRangeParam();
  const detail = useQuery({
    queryKey: queryKeys.campaign(id, range.from, range.to),
    queryFn: () => api.campaigns.detail(id, range),
  });

  const back = (
    <Link to={`/campaigns?days=${days}`} className="btn-ghost btn-sm -ml-2">
      <Icon name="arrowLeft" size={15} /> Chiến dịch
    </Link>
  );

  if (detail.error instanceof ApiError && detail.error.status === 404) {
    return (
      <>
        {back}
        <EmptyState title="Không tìm thấy chiến dịch" icon="search">
          Chiến dịch có thể đã bị xoá. Quay lại danh sách để chọn chiến dịch khác.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <nav aria-label="Vị trí" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        {back}
        {detail.data && (
          <>
            <Icon name="chevronRight" size={14} className="text-subtle" />
            <span className="text-muted">{PLATFORM_META[detail.data.campaign.platform].label}</span>
            <Icon name="chevronRight" size={14} className="text-subtle" />
            <span className="max-w-[40ch] truncate font-medium text-ink">{detail.data.campaign.name}</span>
          </>
        )}
        <div className="ml-auto">
          <DateRangePicker days={days} onChange={setDays} />
        </div>
      </nav>
      <ErrorMessage error={detail.error} />
      {detail.isLoading && <Loading rows={4} />}
      {/* Keyed so local state (e.g. the "copied" notice) resets when moving to a sibling campaign. */}
      {detail.data && <DetailContent key={detail.data.campaign.id} detail={detail.data} range={range} />}
    </>
  );
}

function DetailContent({ detail, range }: { detail: CampaignDetail; range: { from: string; to: string } }) {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const editable = can('campaign:manage');
  const { campaign } = detail;
  const limit = user?.dailyBudgetLimit ?? null;

  // The whole list gives the yardstick CPA and the assistant's recommendation for this campaign.
  const campaigns = useQuery({ queryKey: queryKeys.campaigns(range), queryFn: () => api.campaigns.list(range) });
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });
  const activity = useQuery({
    queryKey: queryKeys.campaignActivity(campaign.id),
    queryFn: () => api.activity.forCampaign(campaign.id),
    enabled: can('activity:view'),
  });
  const accountCpa = typicalCpa(campaigns.data ?? []);
  const minBudget = new Map(integrations.data?.map((i) => [i.platform, i.minDailyBudget]));
  const recommendation = campaigns.data
    ? recommend(campaigns.data, { minBudget, limit }).find((r) => r.campaignId === campaign.id)
    : undefined;
  const summary = summarizeCampaign(detail, accountCpa);
  const currentAccount = detail.advice.accounts.find((a) => a.current);
  const bestAccount = detail.advice.accounts.find((a) => a.recommended);

  const [outcome, setOutcome] = useState<CopyOutcome | null>(null);
  const navigate = useNavigate();

  const refreshStatus = useMutation({
    mutationFn: () => api.campaigns.refreshStatus(campaign.id),
    onSuccess: () => invalidateCampaignViews(queryClient),
  });

  const clone = useMutation({
    mutationFn: () => api.campaigns.cloneToDraft(campaign.id),
    onSuccess: (draft) => navigate(`/campaigns/new?draft=${draft.id}`),
  });

  const update = useMutation({
    mutationFn: (changes: { status?: CampaignStatus; dailyBudget?: number }) => api.campaigns.update(campaign.id, changes),
    onSuccess: () => invalidateCampaignViews(queryClient),
  });
  const applyRec = useApplyRecommendations();
  // One request per target; each succeeds or fails on its own, like the bulk actions.
  const copy = useMutation({
    mutationFn: async (requests: CopyOptions[]): Promise<CopyOutcome> => {
      const result: CopyOutcome = { done: [], errors: [] };
      for (const request of requests) {
        try {
          result.done.push(await api.campaigns.copy(campaign.id, request));
        } catch (error) {
          const label = PLATFORM_META[request.platform ?? campaign.platform].label;
          result.errors.push(`${label}: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`);
        }
      }
      return result;
    },
    onSuccess: (result) => {
      setOutcome(result);
      return invalidateCampaignViews(queryClient);
    },
  });
  const budget = `${formatVnd(campaign.dailyBudget)}/ngày`;
  const onChoose = ({ platform, account, move }: AccountChoice) => {
    const message = move
      ? `Chuyển "${campaign.name}" sang tài khoản "${account.name}"?\n${
          campaign.status === 'ACTIVE'
            ? 'Bản mới ở tài khoản này chạy ngay với cùng nội dung và ngân sách, bản gốc được tạm dừng.'
            : 'Bản mới được tạo ở trạng thái tạm dừng như bản gốc.'
        }`
      : platform === campaign.platform
        ? `Nhân bản "${campaign.name}" (nội dung, ngân sách ${budget}) sang tài khoản "${account.name}"?\nBản sao tạm dừng để bạn duyệt; bản gốc giữ nguyên.`
        : `Mở rộng "${campaign.name}" sang ${PLATFORM_META[platform].label}, tài khoản "${account.name}" (ngân sách ${budget})?\nChiến dịch mới tạm dừng để bạn duyệt.`;
    if (confirm(message)) copy.mutate([{ accountId: account.id, platform, move }]);
  };
  const onLaunch = ({ creative, newCopy, platforms }: Launch) => {
    const labels = platforms.map((p) => PLATFORM_META[p].label).join(', ');
    const message = `Tạo ${platforms.length} chiến dịch trên ${labels}${newCopy ? ' với phương án nội dung mới' : ''}, ngân sách ${budget} mỗi nền tảng, ở tài khoản phù hợp nhất?\nTất cả tạm dừng để bạn duyệt.`;
    if (confirm(message)) copy.mutate(platforms.map((platform) => ({ platform, creative: newCopy ? creative : undefined })));
  };
  const busy = update.isPending || applyRec.isPending || copy.isPending;

  return (
    <div className="space-y-6">
      <header className="card relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-ai-wash" />
        <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <ScoreRing score={summary.health.score} size={72} label={`Điểm sức khoẻ ${summary.health.score}/100 — ${summary.health.label}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformTag platform={campaign.platform} />
              {campaign.connected ? <StatusTag status={campaign.status} /> : <Tag tone="caution">Mất kết nối</Tag>}
              <Tag tone="ai">Sức khoẻ: {summary.health.label}</Tag>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{campaign.name}</h1>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <Meta icon="target" label="Mục tiêu">
                {OBJECTIVE_LABELS[campaign.objective]} · <span translate="no">{campaign.platformObjective}</span>
              </Meta>
              <Meta icon="wallet" label="Tài khoản">
                {currentAccount?.name ?? campaign.accountId ?? '—'}
              </Meta>
              <Meta icon="copy" label="Mã">
                <span className="font-mono" translate="no">
                  {campaign.externalId}
                </span>
              </Meta>
              <Meta icon="history" label="Tạo lúc">
                {formatDateTime(campaign.createdAt)}
              </Meta>
            </dl>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            {editable && (
              <>
                <button
                  type="button"
                  disabled={refreshStatus.isPending}
                  onClick={() => refreshStatus.mutate()}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/[0.04] disabled:opacity-50"
                  title="Kiểm tra và cập nhật trạng thái mới nhất từ Meta"
                >
                  <Icon name="refresh" size={14} className={`mr-1 inline ${refreshStatus.isPending ? 'animate-spin' : ''}`} />
                  {refreshStatus.isPending ? 'Đang đồng bộ...' : 'Làm mới'}
                </button>
                <button
                  type="button"
                  disabled={clone.isPending}
                  onClick={() => clone.mutate()}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/[0.04] disabled:opacity-50"
                  title="Nhân bản cấu hình sang bản nháp mới để sửa và tạo lại"
                >
                  <Icon name="copy" size={14} className="mr-1 inline" />
                  Sửa & tạo lại
                </button>
              </>
            )}

            <div className="rounded-xl border border-line bg-surface px-3 py-2">
              <p className="eyebrow">Ngân sách/ngày</p>
              <div className="mt-0.5 text-base font-semibold">
                <BudgetEditor
                  label={`Ngân sách ngày của ${campaign.name}`}
                  value={campaign.dailyBudget}
                  max={limit ?? undefined}
                  disabled={!editable || !campaign.connected || busy}
                  onSave={(dailyBudget) => update.mutate({ dailyBudget })}
                />
              </div>
            </div>

            {editable && (
              campaign.platform === 'facebook' && campaign.status === 'PAUSED' ? (
                <a
                  href={metaAdsManagerUrl(campaign.accountId, campaign.externalId)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  title="Kích hoạt trực tiếp trên Meta Ads Manager (Quy tắc R3)"
                >
                  Bật trên Meta ↗
                </a>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={campaign.status === 'ACTIVE'}
                  disabled={!campaign.connected || busy}
                  onClick={() => update.mutate({ status: campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium disabled:opacity-45"
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                      campaign.status === 'ACTIVE' ? 'justify-end bg-positive' : 'justify-start bg-line-strong'
                    }`}
                  >
                    <span className="h-5 w-5 rounded-full bg-white shadow-soft" />
                  </span>
                  {campaign.status === 'ACTIVE' ? 'Đang chạy' : 'Đang tắt'}
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <ErrorMessage error={update.error ?? applyRec.error ?? copy.error} />
      {outcome && <CopyNotice outcome={outcome} onClose={() => setOutcome(null)} />}
      {campaign.replacedBy && !outcome && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3 text-sm text-ink">
          <Icon name="info" size={16} className="text-accent" />
          Chiến dịch này đã được chuyển sang tài khoản khác và đang được giữ tạm dừng.
          <Link to={`/campaigns/${campaign.replacedBy}`} className="font-semibold text-accent hover:underline">
            Mở bản đang chạy →
          </Link>
        </p>
      )}

      <KpiRow detail={detail} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-6">
          <section className="card-ai p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ai-gradient text-white">
                <Icon name="sparkles" size={14} />
              </span>
              <p className="text-sm font-semibold">Nhận định của trợ lý</p>
              <AiBadge label="Tự động" />
            </div>
            <p className="mt-3 text-lg font-semibold leading-snug tracking-tight">{summary.headline}</p>
            {summary.points.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {summary.points.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                    <Icon name="chevronRight" size={16} className="mt-0.5 shrink-0 text-spark" />
                    {point}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AccountAdvisor detail={detail} canManage={editable} busy={busy} onChoose={onChoose} />

          {/* Dark Posts per Page Section (Facebook Lifecycle) */}
          {(campaign.pages?.length || campaign.meta?.ads?.length) ? (
            <section className="card-pad">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="section-title">Danh sách Trang & Quảng cáo Dark Post</h2>
                  <p className="mt-1 text-xs text-muted">Mỗi Trang Fanpage chạy một quảng cáo bài viết ẩn độc lập</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {campaign.meta?.ads?.length ?? campaign.pages?.length ?? 0} quảng cáo
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-ink/[0.02] text-muted font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Trang Fanpage</th>
                      <th className="py-2.5 px-3">Meta Ad ID</th>
                      <th className="py-2.5 px-3">Kiểm duyệt Meta</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(campaign.meta?.ads ?? []).map((ad) => {
                      const page = campaign.pages?.find((p) => p.id === ad.pageId);
                      const reviewStatus = ad.review?.status ?? 'APPROVED';
                      return (
                        <tr key={ad.adId} className="hover:bg-ink/[0.01]">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-ink">{page?.name ?? ad.pageId}</div>
                            <div className="text-[11px] text-muted">Page ID: {ad.pageId}</div>
                          </td>
                          <td className="py-3 px-3 font-mono text-muted">{ad.adId}</td>
                          <td className="py-3 px-3">
                            {reviewStatus === 'APPROVED' && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                Đã phê duyệt
                              </span>
                            )}
                            {reviewStatus === 'PENDING' && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                Đang xét duyệt
                              </span>
                            )}
                            {reviewStatus === 'DISAPPROVED' && (
                              <div>
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300">
                                  Từ chối
                                </span>
                                {ad.review?.reason && (
                                  <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                                    {ad.review.reason}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <a
                              href={metaPageAdsCenterUrl(ad.pageId)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent hover:underline font-medium"
                            >
                              Trung tâm QC ↗
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Schedule & Audience Info */}
          {(campaign.schedule || campaign.audience) ? (
            <section className="card-pad">
              <h2 className="section-title">Lịch chạy & Đối tượng mục tiêu</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                {campaign.schedule && (
                  <div className="rounded-xl border border-line bg-surface p-3">
                    <div className="font-semibold text-ink">Lịch trình chiến dịch</div>
                    <div className="mt-1 text-muted">{describeSchedule(campaign.schedule)}</div>
                  </div>
                )}
                {campaign.audience && (
                  <div className="rounded-xl border border-line bg-surface p-3">
                    <div className="font-semibold text-ink">Đối tượng</div>
                    <div className="mt-1 text-muted">
                      {campaign.audience.locations === 'VN' ? 'Toàn quốc' : `${campaign.audience.locations.length} tỉnh thành`} • {campaign.audience.ageMin}–{campaign.audience.ageMax} tuổi
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <PerformanceChart detail={detail} />

          {detail.siblings.length > 0 && <Siblings siblings={detail.siblings} />}

          {can('activity:view') && (
            <section className="card-pad">
              <h2 className="section-title">Lịch sử thay đổi</h2>
              <p className="mt-1 text-xs text-muted">Ai đã làm gì với chiến dịch này, mới nhất trước</p>
              {activity.data?.length ? (
                <ol className="mt-4 space-y-0">
                  {activity.data.map((entry, index) => (
                    <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {index < activity.data.length - 1 && <span aria-hidden className="absolute left-[7px] top-4 h-full w-px bg-line" />}
                      <span
                        aria-hidden
                        className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-surface ${
                          entry.actor === 'rule' ? 'bg-spark' : entry.actor === 'system' ? 'bg-subtle' : 'bg-accent'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{entry.message}</p>
                        <p className="text-2xs text-muted">
                          {entry.actorName} · {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-sm text-muted">{activity.isLoading ? 'Đang tải…' : 'Chưa có thay đổi nào được ghi lại.'}</p>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <Suggestions
            campaign={campaign}
            recommendation={recommendation}
            bestAccount={bestAccount && !bestAccount.current ? bestAccount : undefined}
            editable={editable}
            busy={busy}
            onApply={(rec) => applyRec.mutate([rec])}
            onMove={(account) => onChoose({ platform: campaign.platform, account, move: true })}
          />
          {campaign.creative ? (
            <AdStudio
              campaign={campaign}
              creative={campaign.creative}
              platformOptions={detail.accountCounts.map((c) => c.platform)}
              canLaunch={editable && campaign.connected}
              busy={busy}
              onLaunch={onLaunch}
            />
          ) : (
            <EmptyState title="Chưa có nội dung để xem trước" icon="eye">
              Chiến dịch này được tạo ngoài AdHub nên chưa có nội dung lưu lại. Chiến dịch tạo từ AdHub luôn có bản xem trước.
            </EmptyState>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon name={icon} size={13} className="shrink-0 text-subtle" />
      <dt className="sr-only">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function KpiRow({ detail }: { detail: CampaignDetail }) {
  const { kpis } = detail.campaign;
  const before = detail.previousKpis;
  const delta = (key: keyof Kpis) => (before.spend > 0 ? percentChange(kpis[key], before[key]) : null);
  const series = (pick: (d: CampaignDetail['daily'][number]) => number) => detail.daily.map(pick);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <KpiCard
        label="Chi tiêu"
        value={`${formatCompactVnd(kpis.spend)}đ`}
        title={formatVnd(kpis.spend)}
        hint={`CPM ${formatVnd(kpis.cpm)}`}
        change={delta('spend')}
        trend={series((d) => d.spend)}
      />
      <KpiCard
        label="Doanh thu"
        value={`${formatCompactVnd(kpis.revenue)}đ`}
        title={formatVnd(kpis.revenue)}
        hint={`ROAS ${formatDecimal(kpis.roas)}x`}
        change={delta('revenue')}
        trend={series((d) => d.revenue)}
      />
      <KpiCard
        label="Chuyển đổi"
        value={formatNumber(kpis.conversions)}
        hint={`CPA ${formatVnd(kpis.cpa)}`}
        change={delta('conversions')}
        trend={series((d) => d.conversions)}
      />
      <KpiCard label="Lượt click" value={formatNumber(kpis.clicks)} hint={`CTR ${formatPercent(kpis.ctr)}`} change={delta('clicks')} />
      <KpiCard label="CPA" value={formatVnd(kpis.cpa)} hint="Chi phí mỗi chuyển đổi" change={delta('cpa')} inverse />
    </div>
  );
}

const CHART_VIEWS = [
  { value: 'money', label: 'Chi tiêu & doanh thu' },
  { value: 'conversions', label: 'Chuyển đổi' },
] as const;

function PerformanceChart({ detail }: { detail: CampaignDetail }) {
  const colors = useChartColors();
  const [view, setView] = useState<(typeof CHART_VIEWS)[number]['value']>('money');
  const tooltip = {
    cursor: { stroke: colors.lineStrong, fill: colors.line, fillOpacity: 0.3 },
    contentStyle: {
      borderRadius: 12,
      borderColor: colors.line,
      background: colors.surface,
      color: colors.ink,
      fontSize: 12,
      boxShadow: '0 16px 40px -12px rgb(15 18 30 / 0.25)',
    },
    labelFormatter: (d: string) => formatDate(d),
  };
  const axes = (money: boolean) => [
    <CartesianGrid key="grid" stroke={colors.line} vertical={false} />,
    <XAxis
      key="x"
      dataKey="date"
      tick={{ fontSize: 11, fill: colors.muted }}
      tickLine={false}
      axisLine={{ stroke: colors.lineStrong }}
      tickFormatter={(d: string) => formatDate(d)}
    />,
    <YAxis
      key="y"
      tick={{ fontSize: 11, fill: colors.muted }}
      tickLine={false}
      axisLine={false}
      width={56}
      allowDecimals={false}
      tickFormatter={(v: number) => (money ? formatCompactVnd(v) : formatNumber(v))}
    />,
  ];
  return (
    <section className="card-pad">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Diễn biến theo ngày</h2>
          <p className="mt-1 text-xs text-muted">Khoảng cách giữa doanh thu và chi tiêu là phần lời trên quảng cáo</p>
        </div>
        <Segmented label="Chỉ số biểu đồ" value={view} options={CHART_VIEWS} onChange={setView} />
      </div>
      <ResponsiveContainer width="100%" height={280}>
        {view === 'money' ? (
          <AreaChart data={detail.daily}>
            <defs>
              <linearGradient id="fill-revenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.positive} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.positive} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fill-spend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.accent} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes(true)}
            <Tooltip {...tooltip} formatter={(v: number) => formatVnd(v)} />
            <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke={colors.positive} strokeWidth={2} fill="url(#fill-revenue)" />
            <Area type="monotone" dataKey="spend" name="Chi tiêu" stroke={colors.accent} strokeWidth={2} fill="url(#fill-spend)" />
          </AreaChart>
        ) : (
          <BarChart data={detail.daily}>
            {axes(false)}
            <Tooltip {...tooltip} formatter={(v: number) => formatNumber(v)} />
            <Bar dataKey="conversions" name="Chuyển đổi" fill={colors.spark} radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </section>
  );
}

function Siblings({ siblings }: { siblings: CampaignDetail['siblings'] }) {
  return (
    <section className="card-pad">
      <h2 className="section-title">Cùng chiến dịch đa kênh</h2>
      <p className="mt-1 text-xs text-muted">Được tạo cùng lúc trên các nền tảng khác</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {siblings.map((s) => (
          <li key={s.id}>
            <Link
              to={`/campaigns/${s.id}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-3 py-2.5 transition-colors hover:border-accent/40"
            >
              <PlatformTag platform={s.platform} compact />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="text-2xs tabular-nums text-muted">{formatVnd(s.dailyBudget)}/ngày</span>
              </span>
              <StatusTag status={s.status} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface CopyOutcome {
  done: CopyResult[];
  errors: string[];
}

/** What the last move, duplicate or launch created, with a link to each new campaign. */
function CopyNotice({ outcome, onClose }: { outcome: CopyOutcome; onClose: () => void }) {
  const verb = (r: CopyResult) => (r.moved ? 'Đã chuyển' : 'Đã tạo');
  return (
    <div
      role="status"
      className={`animate-fade-up rounded-xl border px-4 py-3 text-sm ${
        outcome.done.length ? 'border-positive/25 bg-positive-soft' : 'border-negative/25 bg-negative-soft'
      }`}
    >
      <div className="flex items-start gap-3">
        <ul className="min-w-0 flex-1 space-y-1.5">
          {outcome.done.map((r) => (
            <li key={r.campaign.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-positive">
              <Icon name="check" size={15} />
              <PlatformTag platform={r.campaign.platform} compact />
              <span>
                {verb(r)} ở tài khoản <span className="font-semibold">"{r.account.name}"</span> —{' '}
                {r.campaign.status === 'ACTIVE' ? 'đang chạy, bản gốc đã tạm dừng' : 'tạm dừng chờ bạn duyệt'}.
              </span>
              <Link to={`/campaigns/${r.campaign.id}`} className="font-semibold underline-offset-2 hover:underline">
                Mở →
              </Link>
            </li>
          ))}
          {outcome.errors.map((e) => (
            <li key={e} className="flex items-start gap-2 text-negative">
              <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
        <button type="button" className="text-xs font-medium text-muted hover:text-ink" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}

interface SuggestionItem {
  id: string;
  icon: IconName;
  tone: 'ai' | 'caution' | 'info';
  title: string;
  body: string;
  action?: ReactNode;
}

/** "Đề xuất về chiến dịch": every suggestion for this campaign in one collapsible panel. */
function Suggestions({
  campaign,
  recommendation,
  bestAccount,
  editable,
  busy,
  onApply,
  onMove,
}: {
  campaign: Campaign;
  recommendation?: Recommendation;
  bestAccount?: AdAccountOption;
  editable: boolean;
  busy: boolean;
  onApply: (rec: Recommendation) => void;
  onMove: (account: AdAccountOption) => void;
}) {
  const [open, setOpen] = useState(true);
  const items: SuggestionItem[] = [];
  if (recommendation) {
    items.push({
      id: 'performance',
      icon: 'wand',
      tone: recommendation.severity === 'high' ? 'caution' : 'ai',
      title: recommendation.title,
      body: `${recommendation.reason} ${recommendation.impact}.`,
      action: editable && (
        <button type="button" className="btn-ai btn-sm" disabled={busy || !campaign.connected} onClick={() => onApply(recommendation)}>
          <Icon name="check" size={14} /> Áp dụng 1 chạm
        </button>
      ),
    });
  }
  if (bestAccount) {
    items.push({
      id: 'account',
      icon: 'wallet',
      tone: 'ai',
      title: `Chạy trên "${bestAccount.name}"`,
      body: `Điểm phù hợp ${bestAccount.fit.score}/100. ${bestAccount.fit.pros[0] ?? ''}`.trim(),
      action: editable && campaign.creative && (
        <button type="button" className="btn-secondary btn-sm" disabled={busy || !campaign.connected} onClick={() => onMove(bestAccount)}>
          <Icon name="arrowRight" size={14} /> Chuyển sang đó
        </button>
      ),
    });
  }
  const cta = ctaAdvice(campaign.objective);
  items.push({
    id: 'cta',
    icon: 'info',
    tone: 'info',
    title: `Nút kêu gọi hành động: "${cta.label}"`,
    body: cta.reason,
  });
  if (campaign.creative) {
    const review = reviewCreative(campaign.creative);
    items.push({
      id: 'content',
      icon: 'lightbulb',
      tone: review.score >= 80 ? 'info' : 'caution',
      title: `Chất lượng nội dung ${review.score}/100`,
      body: review.tips.length ? review.tips.slice(0, 2).join(' ') : 'Nội dung đã đủ các yếu tố quan trọng.',
    });
  }

  const toneClass = { ai: 'border-spark/25 bg-spark-soft/60', caution: 'border-caution/25 bg-caution-soft', info: 'border-line bg-surface-raised' };
  const iconClass = { ai: 'bg-ai-gradient text-white', caution: 'bg-caution text-white', info: 'bg-accent-soft text-accent' };

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ai-gradient text-white shadow-glow">
          <Icon name="sparkles" size={15} />
        </span>
        <span className="flex-1 text-[0.9375rem] font-semibold">Đề xuất về chiến dịch</span>
        <Tag tone="ai">{items.length}</Tag>
        <Icon name="chevronDown" size={18} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="space-y-2.5 border-t border-line p-4">
          {items.map((item) => (
            <li key={item.id} className={`flex gap-3 rounded-xl border p-3 ${toneClass[item.tone]}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconClass[item.tone]}`}>
                <Icon name={item.icon} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{item.body}</p>
                {item.action && <div className="mt-2.5">{item.action}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
