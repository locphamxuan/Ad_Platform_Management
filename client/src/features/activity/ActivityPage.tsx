import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorMessage, Loading, PageHeader, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { ActivityLog } from '../../lib/types';

const ACTOR_META: Record<ActivityLog['actor'], { label: string; tone: 'accent' | 'caution' | 'neutral' }> = {
  user: { label: 'Người dùng', tone: 'accent' },
  rule: { label: 'Tự động', tone: 'caution' },
  system: { label: 'Hệ thống', tone: 'neutral' },
};

export function ActivityPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.activity,
    queryFn: api.activity.list,
    refetchInterval: 30_000,
  });

  return (
    <>
      <PageHeader
        eyebrow="Kiểm soát"
        title="Nhật ký hoạt động"
        description="Ai đã thay đổi gì và khi nào — do thành viên, rule tự động hay hệ thống thực hiện."
      />
      <ErrorMessage error={error} />
      {isLoading && <Loading />}
      {data?.length === 0 && <EmptyState title="Chưa có hoạt động nào" />}
      {data && data.length > 0 && (
        <ol className="card divide-y divide-line">
          {data.map((entry) => (
            <li key={entry.id} className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:px-6">
              <time dateTime={entry.createdAt} className="text-xs tabular-nums text-muted sm:pt-0.5">
                {formatDateTime(entry.createdAt)}
              </time>
              <div className="min-w-0">
                <p className="text-sm text-ink">{entry.message}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{entry.actorName}</p>
              </div>
              <div className="sm:text-right">
                <Tag tone={ACTOR_META[entry.actor].tone}>{ACTOR_META[entry.actor].label}</Tag>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
