import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { OBJECTIVE_LABELS } from '../../lib/constants';
import { formatVnd } from '../../lib/format';
import type { CampaignDraftState } from '../../lib/types';
import { EmptyState, Loading, PlatformTag } from '../../components/ui';
import { Icon } from '../../components/icons';

export function DraftsTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: drafts, isLoading, error } = useQuery({
    queryKey: ['campaign-drafts'],
    queryFn: api.drafts.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.drafts.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign-drafts'] }),
  });

  const reconcileMutation = useMutation({
    mutationFn: (id: string) => api.drafts.reconcile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const stateBadge = (state: CampaignDraftState) => {
    switch (state) {
      case 'DRAFT':
        return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Đang soạn thảo</span>;
      case 'SUBMITTING':
        return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">Đang gửi Meta...</span>;
      case 'SUBMITTED':
        return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Đã tạo thành công</span>;
      case 'UNCERTAIN':
      case 'NEEDS_RECONCILE':
        return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Cần đối chiếu</span>;
      case 'FAILED':
      default:
        return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">Thất bại</span>;
    }
  };

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
        Không thể tải danh sách bản nháp.
      </div>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <EmptyState title="Chưa có bản nháp nào" icon="fileText">
        Khi bạn tạo chiến dịch mới, hệ thống sẽ tự động lưu bản nháp tại đây để bạn có thể tiếp tục bất kỳ lúc nào.
      </EmptyState>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[750px]">
        <thead className="border-b border-line bg-ink/[0.02]">
          <tr>
            <th className="table-head">Tên bản nháp</th>
            <th className="table-head">Mục tiêu</th>
            <th className="table-head">Kênh</th>
            <th className="table-head">Trạng thái</th>
            <th className="table-head text-right">Ngân sách</th>
            <th className="table-head text-right">Cập nhật</th>
            <th className="table-head text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {drafts.map((d) => {
            const isReconcilable = d.state === 'UNCERTAIN' || d.state === 'NEEDS_RECONCILE';
            return (
              <tr key={d.id} className="hover:bg-ink/[0.02] transition-colors">
                <td className="table-cell max-w-[240px]">
                  <div className="font-semibold text-ink truncate">
                    {d.payload.name || 'Bản nháp chưa đặt tên'}
                  </div>
                  <div className="text-xs text-muted">Bước {d.step}/5 • Bản sửa đổi #{d.revision}</div>
                </td>
                <td className="table-cell text-xs text-muted">
                  {OBJECTIVE_LABELS[d.payload.objective]}
                </td>
                <td className="table-cell">
                  <div className="flex gap-1">
                    {d.payload.platforms?.map((p) => (
                      <PlatformTag key={p} platform={p} compact />
                    ))}
                  </div>
                </td>
                <td className="table-cell">
                  {stateBadge(d.state)}
                </td>
                <td className="table-cell num">
                  {formatVnd(d.payload.totalDailyBudget ?? 0)}
                </td>
                <td className="table-cell text-right text-xs text-muted">
                  {new Date(d.updatedAt).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="table-cell text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    {isReconcilable && (
                      <button
                        type="button"
                        disabled={reconcileMutation.isPending}
                        onClick={() => reconcileMutation.mutate(d.id)}
                        className="btn-secondary btn-sm text-amber-600 dark:text-amber-400"
                        title="Kiểm tra trạng thái thực tế trên Meta bằng mã định danh [AH-tag]"
                      >
                        Đối chiếu Meta
                      </button>
                    )}
                    {d.state !== 'SUBMITTED' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/campaigns/new?draft=${d.id}&step=${d.step}`)}
                        className="btn-primary btn-sm"
                      >
                        Sửa tiếp →
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Xoá bản nháp "${d.payload.name || 'Chưa đặt tên'}"?`)) {
                          deleteMutation.mutate(d.id);
                        }
                      }}
                      className="btn-ghost btn-sm text-negative hover:bg-negative-soft"
                      title="Xoá bản nháp"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

