import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  DateRangePicker,
  EmptyState,
  ErrorMessage,
  IndeterminateCheckbox,
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
import { useRowSelection } from '../../lib/selection';
import type { BulkStatusResult, Campaign, CampaignStatus } from '../../lib/types';
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

/** What a bulk action did, shown above the table until dismissed. */
interface BulkOutcome {
  verb: string;
  count: number;
  errors: BulkStatusResult['errors'];
}

function CampaignTable({ campaigns, editable }: { campaigns: Campaign[]; editable: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Disconnected platforms reject writes, so their rows cannot be selected.
  const selectable = campaigns.filter((c) => c.connected);
  const selection = useRowSelection(selectable.map((c) => c.id));
  const [bulkResult, setBulkResult] = useState<BulkOutcome | null>(null);

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { status?: CampaignStatus; dailyBudget?: number } }) =>
      api.campaigns.update(id, changes),
    onSuccess: () => invalidateCampaignViews(queryClient),
  });
  const afterBulk = (outcome: BulkOutcome) => {
    setBulkResult(outcome);
    selection.clear();
    return invalidateCampaignViews(queryClient);
  };
  const bulk = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: CampaignStatus }) => api.campaigns.bulkStatus(ids, status),
    onSuccess: (result, { status }) =>
      afterBulk({ verb: status === 'ACTIVE' ? 'Đã bật' : 'Đã tạm dừng', count: result.updated, errors: result.errors }),
  });
  const remove = useMutation({
    mutationFn: (ids: string[]) => api.campaigns.bulkDelete(ids),
    onSuccess: (result) => afterBulk({ verb: 'Đã xoá', count: result.deleted, errors: result.errors }),
  });
  const busy = update.isPending || bulk.isPending || remove.isPending;

  const confirmDelete = () => {
    const count = selection.selected.length;
    const message = `Xoá ${count} chiến dịch đã chọn? Chiến dịch bị xoá cả trên nền tảng quảng cáo cùng số liệu đã lưu, không thể hoàn tác.`;
    if (confirm(message)) remove.mutate(selection.selected);
  };
  const names = new Map(campaigns.map((c) => [c.id, c.name]));

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, campaign: Campaign) => {
    // Clicks on the row's own controls (budget editor, buttons, checkbox) keep their meaning.
    if (!editable || !campaign.connected || (event.target as HTMLElement).closest('button, input, a, label')) return;
    selection.toggle(campaign.id, event.shiftKey);
  };

  return (
    <div className="space-y-3">
      <ErrorMessage error={update.error ?? bulk.error ?? remove.error} />
      {bulkResult && (
        <div role="status" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <p>
              {bulkResult.verb} <span className="font-medium tabular-nums">{bulkResult.count}</span> chiến dịch
              {bulkResult.errors.length > 0 && `, ${bulkResult.errors.length} lỗi`}.
            </p>
            <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setBulkResult(null)}>
              Đóng
            </button>
          </div>
          {bulkResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-negative">
              {bulkResult.errors.map((e) => (
                <li key={e.campaignId}>
                  {names.get(e.campaignId) ?? e.campaignId}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {editable && selectable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm">
          {selection.selected.length === 0 ? (
            <>
              <span className="text-muted">Chọn nhanh:</span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => selection.select(selectable.filter((c) => c.status === 'ACTIVE').map((c) => c.id))}
              >
                Đang chạy
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => selection.select(selectable.filter((c) => c.status === 'PAUSED').map((c) => c.id))}
              >
                Đang tạm dừng
              </button>
              <span className="ml-auto hidden text-xs text-subtle sm:inline">Bấm vào dòng để chọn · giữ Shift để chọn liên tiếp</span>
            </>
          ) : (
            <>
              <span className="font-medium tabular-nums">Đã chọn {selection.selected.length}</span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy}
                onClick={() => bulk.mutate({ ids: selection.selected, status: 'PAUSED' })}
              >
                Tạm dừng tất cả
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => bulk.mutate({ ids: selection.selected, status: 'ACTIVE' })}
              >
                Bật tất cả
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm text-negative hover:bg-negative-soft hover:text-negative"
                disabled={busy}
                onClick={confirmDelete}
              >
                Xoá
              </button>
              <button type="button" className="btn-ghost btn-sm ml-auto" onClick={selection.clear}>
                Bỏ chọn
              </button>
            </>
          )}
        </div>
      )}
      <div className="card relative overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              {editable && (
                <th className="table-head w-10">
                  <IndeterminateCheckbox
                    aria-label="Chọn tất cả chiến dịch"
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    disabled={selectable.length === 0}
                    onChange={selection.toggleAll}
                  />
                </th>
              )}
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
              <tr
                key={c.id}
                className={`${selection.isSelected(c.id) ? 'bg-accent-soft/60' : 'hover:bg-canvas/50'} ${
                  editable && c.connected ? 'cursor-pointer' : ''
                }`}
                onClick={(event) => onRowClick(event, c)}
                // Shift-click would otherwise highlight the text between the two rows.
                onMouseDown={(event) => event.shiftKey && event.preventDefault()}
              >
                {editable && (
                  <td className="table-cell w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-ink"
                      aria-label={`Chọn ${c.name}`}
                      disabled={!c.connected}
                      checked={selection.isSelected(c.id)}
                      onChange={(e) => selection.toggle(c.id, (e.nativeEvent as globalThis.MouseEvent).shiftKey)}
                    />
                  </td>
                )}
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
                    disabled={!editable || !c.connected || busy}
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
                      disabled={!c.connected || busy}
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
