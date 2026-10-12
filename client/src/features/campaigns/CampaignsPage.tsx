import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  DateRangePicker,
  EmptyState,
  ErrorMessage,
  Loading,
  PageHeader,
  PlatformTag,
  Segmented,
  StatusTag,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META, PLATFORMS } from '../../lib/constants';
import { formatDecimal, formatNumber, formatVnd } from '../../lib/format';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import type { Campaign, CampaignStatus } from '../../lib/types';
import { useDateRangeParam, useSearchParam } from '../../lib/url-state';
import { BudgetEditor } from './BudgetEditor';

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  ...PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label })),
] as const;
const STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'ACTIVE', label: 'Đang chạy' },
  { value: 'PAUSED', label: 'Tạm dừng' },
] as const;

export function CampaignsPage() {
  const { can } = useAuth();
  const { days, setDays, range } = useDateRangeParam();
  const [platform, setPlatform] = useSearchParam('platform', PLATFORM_OPTIONS.map((o) => o.value), 'all');
  const [status, setStatus] = useSearchParam('status', STATUS_OPTIONS.map((o) => o.value), 'all');
  const filter = {
    ...range,
    platform: platform === 'all' ? undefined : platform,
    status: status === 'all' ? undefined : status,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.campaigns(filter),
    queryFn: () => api.campaigns.list(filter),
  });

  return (
    <>
      <PageHeader
        eyebrow="Quản lý"
        title="Chiến dịch"
        description="Mọi chiến dịch trên Facebook, TikTok và Google Ads trong một bảng."
        actions={
          can('campaign:manage') && (
            <Link to="/campaigns/new" className="btn-primary">
              Tạo chiến dịch đa kênh
            </Link>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="Lọc theo nền tảng" value={platform} options={PLATFORM_OPTIONS} onChange={setPlatform} />
        <Segmented label="Lọc theo trạng thái" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <div className="sm:ml-auto">
          <DateRangePicker days={days} onChange={setDays} />
        </div>
      </div>
      <ErrorMessage error={error} />
      {isLoading && <Loading />}
      {data &&
        (data.length === 0 ? (
          <EmptyState title="Không có chiến dịch phù hợp">Thử bỏ bớt bộ lọc để xem thêm chiến dịch.</EmptyState>
        ) : (
          <CampaignTable campaigns={data} editable={can('campaign:manage')} />
        ))}
    </>
  );
}

function CampaignTable({ campaigns, editable }: { campaigns: Campaign[]; editable: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { status?: CampaignStatus; dailyBudget?: number } }) =>
      api.campaigns.update(id, changes),
    onSuccess: () => invalidateCampaignViews(queryClient),
  });

  return (
    <div className="space-y-3">
      <ErrorMessage error={update.error} />
      <div className="card relative overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className="table-head">Chiến dịch</th>
              <th className="table-head">Nền tảng</th>
              <th className="table-head">Trạng thái</th>
              {['Ngân sách/ngày', 'Chi tiêu', 'Chuyển đổi', 'CPA', 'ROAS'].map((h) => (
                <th key={h} className="table-head text-right">
                  {h}
                </th>
              ))}
              {editable && (
                <th className="table-head text-right">
                  <span className="sr-only">Thao tác</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-canvas/50">
                <td className="table-cell max-w-[280px]">
                  <p className="truncate font-medium text-ink" title={c.name}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted" translate="no">
                    {c.platformObjective} · {c.externalId}
                  </p>
                </td>
                <td className="table-cell">
                  <PlatformTag platform={c.platform} />
                </td>
                <td className="table-cell">
                  {c.connected ? <StatusTag status={c.status} /> : <span className="text-xs text-caution">Mất kết nối</span>}
                </td>
                <td className="table-cell num">
                  <BudgetEditor
                    label={`Ngân sách ngày của ${c.name}`}
                    value={c.dailyBudget}
                    max={user?.dailyBudgetLimit ?? undefined}
                    disabled={!editable || !c.connected || update.isPending}
                    onSave={(dailyBudget) => update.mutate({ id: c.id, changes: { dailyBudget } })}
                  />
                </td>
                <td className="table-cell num">{formatVnd(c.kpis.spend)}</td>
                <td className="table-cell num">{formatNumber(c.kpis.conversions)}</td>
                <td className="table-cell num">{formatVnd(c.kpis.cpa)}</td>
                <td className="table-cell num font-medium">{formatDecimal(c.kpis.roas)}x</td>
                {editable && (
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      className={`${c.status === 'ACTIVE' ? 'btn-secondary' : 'btn-primary'} btn-sm w-24`}
                      disabled={!c.connected || update.isPending}
                      onClick={() =>
                        update.mutate({ id: c.id, changes: { status: c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } })
                      }
                    >
                      {c.status === 'ACTIVE' ? 'Tạm dừng' : 'Bật'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
