import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from '../../components/icons';
import { RecommendationList } from '../../components/RecommendationList';
import { AiBadge, DateRangePicker, EmptyState, ErrorMessage, KpiCard, Loading, PageHeader, PlatformTag, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META } from '../../lib/constants';
import {
  formatCompactVnd,
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatVnd,
  previousRange,
} from '../../lib/format';
import { briefing, dailyTotals, detectSpendAnomaly, percentChange, projectMonthlySpend, recommend } from '../../lib/insights';
import { queryKeys } from '../../lib/query-keys';
import { useChartColors } from '../../lib/theme';
import type { DashboardSummary, Kpis } from '../../lib/types';
import { useDateRangeParam } from '../../lib/url-state';
import { RoleFocus } from './RoleFocus';

export function DashboardPage() {
  const { user } = useAuth();
  const { days, setDays, range } = useDateRangeParam();
  const previous = previousRange(range);
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(range.from, range.to),
    queryFn: () => api.dashboard.summary(range),
    refetchInterval: 60_000,
  });
  // The period before, for "vs previous" deltas; optional, the page works without it.
  const prev = useQuery({
    queryKey: queryKeys.dashboard(previous.from, previous.to),
    queryFn: () => api.dashboard.summary(previous),
  });

  return (
    <>
      <PageHeader
        icon="dashboard"
        eyebrow={`${formatDate(range.from)} – ${formatDate(range.to)}`}
        title={user ? `Chào ${user.name.split(/\s+/).pop()}, đây là bức tranh hôm nay` : 'Tổng quan hiệu quả'}
        description={
          user?.role === 'client'
            ? 'Báo cáo hợp nhất hiệu quả quảng cáo của bạn trên tất cả nền tảng.'
            : 'Số liệu hợp nhất từ mọi nền tảng, cập nhật mỗi phút — trợ lý tóm tắt và đề xuất việc nên làm.'
        }
        actions={<DateRangePicker days={days} onChange={setDays} />}
      />
      <ErrorMessage error={error} />
      {isLoading && <Loading />}
      {data &&
        (data.byPlatform.length === 0 ? (
          <EmptyState title="Chưa có nền tảng nào được kết nối" icon="plug">
            Kết nối Facebook, TikTok hoặc Google Ads để bắt đầu xem báo cáo.
          </EmptyState>
        ) : (
          <DashboardContent data={data} previous={prev.data} range={range} />
        ))}
    </>
  );
}

function DashboardContent({
  data,
  previous,
  range,
}: {
  data: DashboardSummary;
  previous?: DashboardSummary;
  range: { from: string; to: string };
}) {
  const { can, user } = useAuth();
  const { totals } = data;
  const before = previous?.totals;
  const delta = (key: keyof Kpis) => (before ? percentChange(totals[key], before[key]) : undefined);
  const spendTrend = dailyTotals(data.dailySpend);

  return (
    <div className="space-y-6">
      <Briefing data={data} previous={previous} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          label="Chi tiêu"
          value={`${formatCompactVnd(totals.spend)}đ`}
          title={formatVnd(totals.spend)}
          hint={`CPM ${formatVnd(totals.cpm)}`}
          change={delta('spend')}
          trend={spendTrend}
        />
        <KpiCard label="Lượt click" value={formatNumber(totals.clicks)} hint={`CTR ${formatPercent(totals.ctr)}`} change={delta('clicks')} />
        <KpiCard label="Chuyển đổi" value={formatNumber(totals.conversions)} hint={`CPC ${formatVnd(totals.cpc)}`} change={delta('conversions')} />
        <KpiCard label="CPA" value={formatVnd(totals.cpa)} hint="Chi phí mỗi chuyển đổi" change={delta('cpa')} inverse />
        <KpiCard label="ROAS" value={`${formatDecimal(totals.roas)}x`} hint={`Doanh thu ${formatVnd(totals.revenue)}`} change={delta('roas')} />
      </div>

      {can('campaign:view') && <DashboardRecommendations range={range} canApply={can('campaign:manage')} limit={user?.dailyBudgetLimit ?? null} />}

      <div className="empty:hidden">
        <RoleFocus range={range} />
      </div>

      <SpendChart data={data} />
      <PlatformComparison data={data} />
    </div>
  );
}

function Briefing({ data, previous }: { data: DashboardSummary; previous?: DashboardSummary }) {
  const summary = briefing(data, previous);
  const anomaly = detectSpendAnomaly(data.dailySpend);
  const projected = projectMonthlySpend(data.dailySpend, new Date());
  const days = dailyTotals(data.dailySpend);
  const averageDay = days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;

  return (
    <section className="card-ai overflow-hidden">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ai-gradient text-white">
              <Icon name="sparkles" size={14} />
            </span>
            <p className="text-sm font-semibold">Bản tin của trợ lý</p>
            <AiBadge label="Tự động" />
          </div>
          <p className="mt-3 text-lg font-semibold leading-snug tracking-tight text-ink">{summary.headline}</p>
          <ul className="mt-3 space-y-1.5">
            {summary.points.map((point) => (
              <li key={point} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                <Icon name="chevronRight" size={16} className="mt-0.5 shrink-0 text-spark" />
                {point}
              </li>
            ))}
          </ul>
          {anomaly && (
            <p
              className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
                anomaly.direction === 'spike' ? 'bg-caution-soft text-caution' : 'bg-accent-soft text-accent'
              }`}
            >
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              Chi tiêu ngày {formatDate(anomaly.date)} {anomaly.direction === 'spike' ? 'tăng' : 'giảm'} bất thường:{' '}
              {formatVnd(anomaly.value)}, bằng {formatDecimal(anomaly.ratio)} lần ngày thường.
            </p>
          )}
        </div>
        <div className="flex flex-col justify-center rounded-2xl bg-ai-gradient p-5 text-white">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-white/75">Dự báo chi tiêu tháng này</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCompactVnd(projected)}đ</p>
          <p className="mt-1 text-xs text-white/80">
            Theo nhịp trung bình {formatVnd(averageDay)}/ngày trong kỳ đang xem.
          </p>
        </div>
      </div>
    </section>
  );
}

function DashboardRecommendations({ range, canApply, limit }: { range: { from: string; to: string }; canApply: boolean; limit: number | null }) {
  const campaigns = useQuery({ queryKey: queryKeys.campaigns(range), queryFn: () => api.campaigns.list(range) });
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });
  if (!campaigns.data) return null;
  const minBudget = new Map(integrations.data?.map((i) => [i.platform, i.minDailyBudget]));
  return <RecommendationList recommendations={recommend(campaigns.data, { minBudget, limit })} canApply={canApply} limit={4} showAllLink />;
}

function SpendChart({ data }: { data: DashboardSummary }) {
  const colors = useChartColors();
  return (
    <section className="card-pad">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="section-title">Chi tiêu theo ngày</h2>
          <p className="mt-1 text-xs text-muted">Cộng dồn theo nền tảng</p>
        </div>
        <ul className="flex flex-wrap gap-4" aria-label="Chú thích">
          {data.byPlatform.map(({ platform }) => (
            <li key={platform}>
              <PlatformTag platform={platform} />
            </li>
          ))}
        </ul>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data.dailySpend}>
          <defs>
            {data.byPlatform.map(({ platform }) => (
              <linearGradient key={platform} id={`fill-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PLATFORM_META[platform].color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={PLATFORM_META[platform].color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={colors.line} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: colors.muted }}
            tickLine={false}
            axisLine={{ stroke: colors.lineStrong }}
            tickFormatter={(d: string) => formatDate(d)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: colors.muted }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => formatCompactVnd(v)}
          />
          <Tooltip
            cursor={{ stroke: colors.lineStrong }}
            contentStyle={{
              borderRadius: 12,
              borderColor: colors.line,
              background: colors.surface,
              color: colors.ink,
              fontSize: 12,
              boxShadow: '0 16px 40px -12px rgb(15 18 30 / 0.25)',
            }}
            labelFormatter={(d: string) => formatDate(d)}
            formatter={(v: number) => formatVnd(v)}
          />
          {data.byPlatform.map(({ platform }) => (
            <Area
              key={platform}
              type="monotone"
              dataKey={platform}
              name={PLATFORM_META[platform].label}
              stackId="spend"
              stroke={PLATFORM_META[platform].color}
              strokeWidth={2}
              fill={`url(#fill-${platform})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}

function PlatformComparison({ data }: { data: DashboardSummary }) {
  const bestRoas = Math.max(...data.byPlatform.map((p) => p.kpis.roas), 0);
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pb-4 pt-5 sm:px-6">
        <h2 className="section-title">So sánh nền tảng</h2>
        <p className="mt-1 text-xs text-muted">Thanh ROAS so với nền tảng tốt nhất trong kỳ</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-y border-line bg-ink/[0.02]">
            <tr>
              <th className="table-head">Nền tảng</th>
              {['Đang chạy', 'Chi tiêu', 'Click', 'CTR', 'CPC', 'Chuyển đổi', 'CPA'].map((h) => (
                <th key={h} className="table-head text-right">
                  {h}
                </th>
              ))}
              <th className="table-head w-48">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.byPlatform.map(({ platform, kpis, activeCampaigns, totalCampaigns }) => (
              <tr key={platform} className="hover:bg-ink/[0.02]">
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <PlatformTag platform={platform} />
                    {kpis.roas === bestRoas && bestRoas > 0 && data.byPlatform.length > 1 && <Tag tone="ai">Hiệu quả nhất</Tag>}
                  </div>
                </td>
                <td className="table-cell num text-muted">
                  {activeCampaigns}/{totalCampaigns}
                </td>
                <td className="table-cell num font-medium">{formatVnd(kpis.spend)}</td>
                <td className="table-cell num">{formatNumber(kpis.clicks)}</td>
                <td className="table-cell num">{formatPercent(kpis.ctr)}</td>
                <td className="table-cell num">{formatVnd(kpis.cpc)}</td>
                <td className="table-cell num">{formatNumber(kpis.conversions)}</td>
                <td className="table-cell num">{formatVnd(kpis.cpa)}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${bestRoas ? Math.max(4, (kpis.roas / bestRoas) * 100) : 0}%`,
                          background: PLATFORM_META[platform].color,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums">{formatDecimal(kpis.roas)}x</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
