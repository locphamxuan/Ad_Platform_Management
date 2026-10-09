import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorMessage, Loading, PageHeader, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import type { Rule, RuleRunResult } from '../../lib/types';
import { describeRule } from './describe-rule';
import { RuleForm } from './RuleForm';

export function RulesPage() {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const canManage = can('rule:manage');
  /** Mirrors the server: users under a budget cap cannot run or enable a budget increase. */
  const isLocked = (rule: Rule) => rule.action.type === 'increase_budget' && user?.dailyBudgetLimit != null;
  const [lastRun, setLastRun] = useState<RuleRunResult | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.rules, queryFn: api.rules.list });

  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.rules }), invalidateCampaignViews(queryClient)]);
  const toggle = useMutation({ mutationFn: (r: Rule) => api.rules.setEnabled(r.id, !r.enabled), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.rules.remove(id), onSuccess: refresh });
  const run = useMutation({
    mutationFn: (id: string) => api.rules.run(id),
    onSuccess: (result) => {
      setLastRun(result);
      return refresh();
    },
  });
  const busy = toggle.isPending || remove.isPending || run.isPending;

  return (
    <>
      <PageHeader
        eyebrow="Tự động hoá"
        title="Quy tắc tối ưu"
        description="Rule đang bật được kiểm tra mỗi phút. Giới hạn an toàn: tối đa ±50% ngân sách mỗi lần, trần 50 triệu đồng mỗi ngày."
      />
      <div className={`grid items-start gap-6 ${canManage ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <div className="space-y-4">
          <ErrorMessage error={error ?? toggle.error ?? remove.error ?? run.error} />
          {lastRun && <RunResult result={lastRun} onClose={() => setLastRun(null)} />}
          {isLoading && <Loading />}
          {data?.length === 0 && <EmptyState title="Chưa có rule nào">Tạo rule đầu tiên ở khung bên cạnh.</EmptyState>}
          {data?.map((rule) => {
            const { condition, action, scope } = describeRule(rule);
            return (
              <article key={rule.id} className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{rule.name}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {scope} · Lần chạy gần nhất: {rule.lastRunAt ? formatDateTime(rule.lastRunAt) : 'chưa chạy'}
                    </p>
                  </div>
                  {rule.enabled ? <Tag tone="positive">Đang bật</Tag> : <Tag>Đang tắt</Tag>}
                </div>

                <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-2">
                  <div className="bg-canvas/60 px-4 py-3">
                    <dt className="eyebrow">Nếu</dt>
                    <dd className="mt-1 font-medium tabular-nums">{condition}</dd>
                  </div>
                  <div className="bg-canvas/60 px-4 py-3">
                    <dt className="eyebrow">Thì</dt>
                    <dd className="mt-1 font-medium">{action}</dd>
                  </div>
                </dl>

                {canManage && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={busy || isLocked(rule)}
                      onClick={() => run.mutate(rule.id)}
                    >
                      Chạy ngay
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={busy || (!rule.enabled && isLocked(rule))}
                      onClick={() => toggle.mutate(rule)}
                    >
                      {rule.enabled ? 'Tắt rule' : 'Bật rule'}
                    </button>
                    {isLocked(rule) && <span className="text-xs text-muted">Cần Quản trị viên để bật hoặc chạy</span>}
                    <button
                      type="button"
                      className="btn-ghost btn-sm ml-auto text-negative hover:bg-negative-soft hover:text-negative"
                      disabled={busy}
                      onClick={() => confirm(`Xoá rule "${rule.name}"? Thao tác này không thể hoàn tác.`) && remove.mutate(rule.id)}
                    >
                      Xoá
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {canManage && <RuleForm onCreated={refresh} />}
      </div>
    </>
  );
}

function RunResult({ result, onClose }: { result: RuleRunResult; onClose: () => void }) {
  return (
    <div role="status" className="rounded-xl border border-accent/20 bg-accent-soft p-5 text-sm">
      <div className="flex items-start justify-between gap-4">
        <p className="font-semibold text-ink">
          “{result.ruleName}”: đã kiểm tra {result.evaluated} chiến dịch, thực hiện {result.actions.length} hành động
        </p>
        <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={onClose}>
          Đóng
        </button>
      </div>
      {(result.actions.length > 0 || result.errors.length > 0) && (
        <ul className="mt-3 space-y-1 text-ink">
          {result.actions.map((a) => (
            <li key={a.campaignId}>
              {a.campaignName}: <span className="font-medium">{a.description}</span>
            </li>
          ))}
          {result.errors.map((e) => (
            <li key={e} className="text-negative">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
