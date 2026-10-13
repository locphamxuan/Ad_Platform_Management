import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/icons';
import { RecommendationList } from '../../components/RecommendationList';
import {
  DateRangePicker,
  EmptyState,
  ErrorMessage,
  IndeterminateCheckbox,
  Loading,
  PageHeader,
  PlatformTag,
  ScoreRing,
  Segmented,
  StatusTag,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META, PLATFORMS } from '../../lib/constants';
import { formatDecimal, formatNumber, formatVnd } from '../../lib/format';
import { campaignHealth, recommend, typicalCpa, type Recommendation } from '../../lib/insights';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import { useRowSelection } from '../../lib/selection';
import { fold } from '../../lib/text';
import type { BulkStatusResult, Campaign, CampaignStatus } from '../../lib/types';
import { useDateRangeParam, useSearchParam, useTextParam } from '../../lib/url-state';
import { BudgetEditor } from './BudgetEditor';
import { useApplyRecommendations } from './use-apply-recommendations';

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  ...PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label })),
] as const;
const STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'ACTIVE', label: 'Đang chạy' },
  { value: 'PAUSED', label: 'Tạm dừng' },
] as const;
const SORT_OPTIONS = [
  { value: 'default', label: 'Mặc định' },
  { value: 'health', label: 'Cần xem trước' },
  { value: 'spend', label: 'Chi nhiều nhất' },
  { value: 'roas', label: 'ROAS cao nhất' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['value'];

export function CampaignsPage() {
  const { can, user } = useAuth();
  const { days, setDays, range } = useDateRangeParam();
  const [platform, setPlatform] = useSearchParam('platform', PLATFORM_OPTIONS.map((o) => o.value), 'all');
  const [status, setStatus] = useSearchParam('status', STATUS_OPTIONS.map((o) => o.value), 'all');
  const [sort, setSort] = useSearchParam('sort', SORT_OPTIONS.map((o) => o.value), 'default');
  const [search, setSearch] = useTextParam('q');
  const filter = {
    ...range,
    platform: platform === 'all' ? undefined : platform,
    status: status === 'all' ? undefined : status,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.campaigns(filter),
    queryFn: () => api.campaigns.list(filter),
  });
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });
  const minBudget = new Map(integrations.data?.map((i) => [i.platform, i.minDailyBudget]));
  const recommendations = data ? recommend(data, { minBudget, limit: user?.dailyBudgetLimit ?? null }) : [];

  const needle = fold(search.trim());
  const visible = (data ?? []).filter((c) => !needle || fold(`${c.name} ${c.externalId}`).includes(needle));

  return (
    <>
      <PageHeader
        icon="megaphone"
        eyebrow="Quản lý"
        title="Chiến dịch"
        description="Mọi chiến dịch trên Facebook, TikTok và Google Ads trong một bảng — trợ lý chấm điểm và gợi ý việc cần làm cho từng dòng."
        actions={
          can('campaign:manage') && (
            <Link to="/campaigns/new" className="btn-ai">
              <Icon name="wand" size={16} />
              Tạo chiến dịch với AI
            </Link>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <span className="sr-only">Tìm chiến dịch</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            className="input pl-9"
            type="search"
            placeholder="Tìm theo tên hoặc mã…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Segmented label="Lọc theo nền tảng" value={platform} options={PLATFORM_OPTIONS} onChange={setPlatform} />
        <Segmented label="Lọc theo trạng thái" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <div className="sm:ml-auto">
          <DateRangePicker days={days} onChange={setDays} />
        </div>
      </div>
      <ErrorMessage error={error} />
      {isLoading && <Loading />}
      {data && (
        <div className="space-y-5">
          {data.length > 0 && <RecommendationList recommendations={recommendations} canApply={can('campaign:manage')} limit={5} />}
          {visible.length === 0 ? (
            <EmptyState title="Không có chiến dịch phù hợp" icon="filter">
              Thử bỏ bớt bộ lọc hoặc từ khoá để xem thêm chiến dịch.
            </EmptyState>
          ) : (
            <CampaignTable
              campaigns={sortCampaigns(visible, sort)}
              recommendations={recommendations}
              editable={can('campaign:manage')}
              sort={sort}
              onSort={setSort}
            />
          )}
        </div>
      )}
    </>
  );
}

function sortCampaigns(campaigns: Campaign[], sort: SortKey): Campaign[] {
  if (sort === 'default') return campaigns;
  const accountCpa = typicalCpa(campaigns);
  const key = (c: Campaign) =>
    sort === 'health' ? campaignHealth(c.kpis, accountCpa).score : sort === 'spend' ? -c.kpis.spend : -c.kpis.roas;
  return [...campaigns].sort((a, b) => key(a) - key(b));
}

/** What a bulk action did, shown above the table until dismissed. */
interface BulkOutcome {
  verb: string;
  count: number;
  errors: BulkStatusResult['errors'];
}

function CampaignTable({
  campaigns,
  recommendations,
  editable,
  sort,
  onSort,
}: {
  campaigns: Campaign[];
  recommendations: readonly Recommendation[];
  editable: boolean;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Disconnected platforms reject writes, so their rows cannot be selected.
  const selectable = campaigns.filter((c) => c.connected);
  const selection = useRowSelection(selectable.map((c) => c.id));
  const [bulkResult, setBulkResult] = useState<BulkOutcome | null>(null);
  const accountCpa = typicalCpa(campaigns);
  const recByCampaign = new Map(recommendations.map((r) => [r.campaignId, r]));
  const applyRec = useApplyRecommendations();

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
  const busy = update.isPending || bulk.isPending || remove.isPending || applyRec.isPending;

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
      <ErrorMessage error={update.error ?? bulk.error ?? remove.error ?? applyRec.error} />
      {bulkResult && (
        <div role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-soft">
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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-soft">
        {editable && selection.selected.length > 0 ? (
          <>
            <span className="px-1 font-medium tabular-nums">Đã chọn {selection.selected.length}</span>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={busy}
              onClick={() => bulk.mutate({ ids: selection.selected, status: 'PAUSED' })}
            >
              <Icon name="pause" size={14} /> Tạm dừng
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() => bulk.mutate({ ids: selection.selected, status: 'ACTIVE' })}
            >
              <Icon name="play" size={14} /> Bật
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm text-negative hover:bg-negative-soft hover:text-negative"
              disabled={busy}
              onClick={confirmDelete}
            >
              <Icon name="trash" size={14} /> Xoá
            </button>
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={selection.clear}>
              Bỏ chọn
            </button>
          </>
        ) : (
          <>
            {editable && selectable.length > 0 && (
              <>
                <span className="px-1 text-muted">Chọn nhanh:</span>
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
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    selection.select(selectable.filter((c) => campaignHealth(c.kpis, accountCpa).score < 45).map((c) => c.id))
                  }
                >
                  Điểm thấp
                </button>
              </>
            )}
            <div className="ml-auto min-w-0 max-w-full">
              <Segmented label="Sắp xếp" value={sort} options={SORT_OPTIONS} onChange={onSort} />
            </div>
          </>
        )}
      </div>
      <div className="card relative overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="border-b border-line bg-ink/[0.02]">
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
              <th className="table-head">Trạng thái</th>
              <th className="table-head text-center">Điểm</th>
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
            {campaigns.map((c) => {
              const health = campaignHealth(c.kpis, accountCpa);
              const rec = recByCampaign.get(c.id);
              return (
                <tr
                  key={c.id}
                  className={`transition-colors ${selection.isSelected(c.id) ? 'bg-accent-soft/70' : 'hover:bg-ink/[0.02]'} ${
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
                        className="h-4 w-4 rounded accent-accent"
                        aria-label={`Chọn ${c.name}`}
                        disabled={!c.connected}
                        checked={selection.isSelected(c.id)}
                        onChange={(e) => selection.toggle(c.id, (e.nativeEvent as globalThis.MouseEvent).shiftKey)}
                      />
                    </td>
                  )}
                  <td className="table-cell max-w-[280px]">
                    <div className="flex items-center gap-3">
                      <PlatformTag platform={c.platform} compact />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink" title={c.name}>
                          {c.name}
                        </p>
                        {rec ? (
                          <p
                            className={`mt-0.5 flex items-center gap-1 truncate text-xs font-medium ${
                              rec.severity === 'high' ? 'text-negative' : rec.severity === 'medium' ? 'text-caution' : 'text-positive'
                            }`}
                            title={`Trợ lý gợi ý: ${rec.title} — ${rec.reason}`}
                          >
                            <Icon name="sparkles" size={12} className="shrink-0" />
                            <span className="truncate">{rec.title}</span>
                          </p>
                        ) : (
                          <p className="mt-0.5 truncate text-xs text-muted" translate="no">
                            {PLATFORM_META[c.platform].label} · {c.platformObjective} · {c.externalId}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    {c.connected ? <StatusTag status={c.status} /> : <span className="text-xs text-caution">Mất kết nối</span>}
                  </td>
                  <td className="table-cell text-center">
                    <ScoreRing score={health.score} label={`Điểm sức khoẻ ${health.score}/100 — ${health.label}`} />
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
                  <td className="table-cell num font-semibold">{formatDecimal(c.kpis.roas)}x</td>
                  {editable && (
                    <td className="table-cell whitespace-nowrap text-right">
                      {rec && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm mr-1 w-8 px-0 text-spark"
                          disabled={busy}
                          title={`Áp dụng gợi ý: ${rec.title}`}
                          aria-label={`Áp dụng gợi ý: ${rec.title} cho ${c.name}`}
                          onClick={() => applyRec.mutate([rec])}
                        >
                          <Icon name="wand" size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${c.status === 'ACTIVE' ? 'btn-secondary' : 'btn-primary'} btn-sm w-24`}
                        disabled={!c.connected || busy}
                        onClick={() =>
                          update.mutate({ id: c.id, changes: { status: c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } })
                        }
                      >
                        <Icon name={c.status === 'ACTIVE' ? 'pause' : 'play'} size={13} />
                        {c.status === 'ACTIVE' ? 'Dừng' : 'Bật'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
