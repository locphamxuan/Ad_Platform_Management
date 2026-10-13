import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../../components/icons';
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
  const enabled = data?.filter((r) => r.enabled).length ?? 0;

  return (
    <>
      <PageHeader
        icon="zap"
        eyebrow="Tự động hoá"
        title="Quy tắc tối ưu"
        description="Rule đang bật được kiểm tra mỗi phút. Giới hạn an toàn: tối đa ±50% ngân sách mỗi lần, trần 50 triệu đồng mỗi ngày."
      />
      <div className={`grid items-start gap-6 ${canManage ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        <div className="space-y-4">
          {data && data.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Stat icon="zap" label="Tổng rule" value={data.length} />
              <Stat icon="play" label="Đang bật" value={enabled} />
              <Stat icon="shield" label="Đang tắt" value={data.length - enabled} />
            </div>
          )}
          <ErrorMessage error={error ?? toggle.error ?? remove.error ?? run.error} />
          {lastRun && <RunResult result={lastRun} onClose={() => setLastRun(null)} />}
          {isLoading && <Loading rows={2} />}
          {data?.length === 0 && (
            <EmptyState title="Chưa có rule nào" icon="zap">
              Mô tả quy tắc bằng một câu ở khung bên cạnh — trợ lý chuyển thành rule và cho bạn xem trước tác động.
            </EmptyState>
          )}
          {data?.map((rule) => {
            const { condition, action, scope } = describeRule(rule);
            return (
              <article key={rule.id} className={`card-pad transition-opacity ${rule.enabled ? '' : 'opacity-75'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{rule.name}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {scope} · Lần chạy gần nhất: {rule.lastRunAt ? formatDateTime(rule.lastRunAt) : 'chưa chạy'}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={rule.enabled ? `Tắt rule ${rule.name}` : `Bật rule ${rule.name}`}
                      disabled={busy || (!rule.enabled && isLocked(rule))}
                      onClick={() => toggle.mutate(rule)}
                      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-45 ${
                        rule.enabled ? 'justify-end bg-positive' : 'justify-start bg-line-strong'
                      }`}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow-soft" />
                    </button>
                  ) : rule.enabled ? (
                    <Tag tone="positive">Đang bật</Tag>
                  ) : (
                    <Tag>Đang tắt</Tag>
                  )}
                </div>

                <div className="mt-4 grid items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="rounded-xl bg-ink/[0.03] px-4 py-3">
                    <p className="eyebrow">Nếu</p>
                    <p className="mt-1 font-medium tabular-nums">{condition}</p>
                  </div>
                  <Icon name="arrowRight" className="mx-auto hidden text-accent sm:block" />
                  <div className="rounded-xl bg-accent-soft px-4 py-3">
                    <p className="eyebrow text-accent">Thì</p>
                    <p className="mt-1 font-medium">{action}</p>
                  </div>
                </div>

                {canManage && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={busy || isLocked(rule)}
                      onClick={() => run.mutate(rule.id)}
                    >
                      <Icon name="play" size={13} />
                      Chạy ngay
                    </button>
                    {isLocked(rule) && <span className="text-xs text-muted">Cần Chủ sở hữu để bật hoặc chạy</span>}
                    <button
                      type="button"
                      className="btn-ghost btn-sm ml-auto text-negative hover:bg-negative-soft hover:text-negative"
                      disabled={busy}
                      onClick={() => confirm(`Xoá rule "${rule.name}"? Thao tác này không thể hoàn tác.`) && remove.mutate(rule.id)}
                    >
                      <Icon name="trash" size={14} />
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

function Stat({ icon, label, value }: { icon: 'zap' | 'play' | 'shield'; label: string; value: number }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function RunResult({ result, onClose }: { result: RuleRunResult; onClose: () => void }) {
  return (
    <div role="status" className="card-ai animate-fade-up p-5 text-sm">
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
