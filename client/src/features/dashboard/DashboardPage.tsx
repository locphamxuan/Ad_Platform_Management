import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker, EmptyState, ErrorMessage, KpiCard, Loading, PageHeader, PlatformTag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META } from '../../lib/constants';
import { formatCompactVnd, formatDate, formatDecimal, formatNumber, formatPercent, formatVnd } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { DashboardSummary } from '../../lib/types';
import { useDateRangeParam } from '../../lib/url-state';
import { RoleFocus } from './RoleFocus';

export function DashboardPage() {
  const { user } = useAuth();
  const { days, setDays, range } = useDateRangeParam();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(range.from, range.to),
    queryFn: () => api.dashboard.summary(range),
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(range.from)} – ${formatDate(range.to)}`}
        title="Tổng quan hiệu quả"
        description={
          user?.role === 'client'
            ? 'Báo cáo hợp nhất hiệu quả quảng cáo của bạn trên tất cả nền tảng.'
            : 'Số liệu hợp nhất từ tất cả nền tảng đang kết nối, cập nhật mỗi phút.'
        }
        actions={<DateRangePicker days={days} onChange={setDays} />}
      />
      <div className="mb-6 empty:hidden">
        <RoleFocus range={range} />
      </div>
      <ErrorMessage error={error} />
      {isLoading && <Loading />}
      {data &&
        (data.byPlatform.length === 0 ? (
          <EmptyState title="Chưa có nền tảng nào được kết nối">
            Kết nối Facebook, TikTok hoặc Google Ads để bắt đầu xem báo cáo.
          </EmptyState>
        ) : (
          <DashboardContent data={data} />
        ))}
    </>
  );
}

function DashboardContent({ data }: { data: DashboardSummary }) {
  const { totals } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard label="Chi tiêu" value={formatVnd(totals.spend)} hint={`CPM ${formatVnd(totals.cpm)}`} />
        <KpiCard label="Lượt click" value={formatNumber(totals.clicks)} hint={`CTR ${formatPercent(totals.ctr)}`} />
        <KpiCard label="Chuyển đổi" value={formatNumber(totals.conversions)} hint={`CPC ${formatVnd(totals.cpc)}`} />
        <KpiCard label="CPA" value={formatVnd(totals.cpa)} hint="Chi phí mỗi chuyển đổi" />
        <KpiCard label="ROAS" value={`${formatDecimal(totals.roas)}x`} hint={`Doanh thu ${formatVnd(totals.revenue)}`} />
      </div>

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
          <BarChart data={data.dailySpend} barCategoryGap="28%">
            <CartesianGrid stroke="#E4E2DC" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6A6E76' }}
              tickLine={false}
              axisLine={{ stroke: '#CFCCC4' }}
              tickFormatter={(d: string) => formatDate(d)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6A6E76' }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => formatCompactVnd(v)}
            />
            <Tooltip
              cursor={{ fill: '#F5F4F0' }}
              contentStyle={{ borderRadius: 8, borderColor: '#E4E2DC', fontSize: 12 }}
              labelFormatter={(d: string) => formatDate(d)}
              formatter={(v: number) => formatVnd(v)}
            />
            {data.byPlatform.map(({ platform }) => (
              <Bar
                key={platform}
                dataKey={platform}
                name={PLATFORM_META[platform].label}
                stackId="spend"
                fill={PLATFORM_META[platform].color}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pb-4 pt-5 sm:px-6">
          <h2 className="section-title">So sánh nền tảng</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-y border-line bg-canvas/60">
              <tr>
                <th className="table-head">Nền tảng</th>
                {['Đang chạy', 'Chi tiêu', 'Click', 'CTR', 'CPC', 'Chuyển đổi', 'CPA', 'ROAS'].map((h) => (
                  <th key={h} className="table-head text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.byPlatform.map(({ platform, kpis, activeCampaigns, totalCampaigns }) => (
                <tr key={platform} className="hover:bg-canvas/50">
                  <td className="table-cell">
                    <PlatformTag platform={platform} />
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
                  <td className="table-cell num font-semibold">{formatDecimal(kpis.roas)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
