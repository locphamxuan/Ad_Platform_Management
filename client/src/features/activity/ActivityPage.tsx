import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { EmptyState, ErrorMessage, Loading, PageHeader, Segmented, Tag, type Tone } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { fold } from '../../lib/text';
import type { ActivityLog } from '../../lib/types';

const ACTOR_META: Record<ActivityLog['actor'], { label: string; tone: Tone; icon: IconName }> = {
  user: { label: 'Người dùng', tone: 'accent', icon: 'user' },
  rule: { label: 'Tự động', tone: 'ai', icon: 'zap' },
  system: { label: 'Hệ thống', tone: 'neutral', icon: 'shield' },
};

const ACTOR_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'user', label: 'Người dùng' },
  { value: 'rule', label: 'Tự động' },
  { value: 'system', label: 'Hệ thống' },
] as const;
type ActorFilter = (typeof ACTOR_OPTIONS)[number]['value'];

const dayLabel = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const timeLabel = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function ActivityPage() {
  const [actor, setActor] = useState<ActorFilter>('all');
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.activity,
    queryFn: api.activity.list,
    refetchInterval: 30_000,
  });

  const needle = fold(search.trim());
  const entries = (data ?? []).filter(
    (e) => (actor === 'all' || e.actor === actor) && (!needle || fold(`${e.message} ${e.actorName}`).includes(needle)),
  );
  // Newest first, grouped under one heading per local day.
  const groups = new Map<string, ActivityLog[]>();
  for (const entry of entries) {
    const key = dayLabel.format(new Date(entry.createdAt));
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const automated = data?.filter((e) => e.actor === 'rule').length ?? 0;

  return (
    <>
      <PageHeader
        icon="history"
        eyebrow="Kiểm soát"
        title="Nhật ký hoạt động"
        description="Ai đã thay đổi gì và khi nào — do thành viên, rule tự động hay hệ thống thực hiện."
      />
      {data && data.length > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <Icon name="sparkles" size={15} className="text-spark" />
          {automated} trong {data.length} thao tác gần đây do rule tự động thực hiện.
        </p>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <span className="sr-only">Tìm trong nhật ký</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            className="input pl-9"
            type="search"
            placeholder="Tìm theo nội dung hoặc người…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Segmented label="Lọc theo nguồn" value={actor} options={ACTOR_OPTIONS} onChange={setActor} />
      </div>
      <ErrorMessage error={error} />
      {isLoading && <Loading rows={4} />}
      {data && entries.length === 0 && <EmptyState title="Không có hoạt động phù hợp" icon="history" />}
      <div className="space-y-6">
        {[...groups].map(([day, items]) => (
          <section key={day}>
            <h2 className="eyebrow mb-2 first-letter:uppercase">{day}</h2>
            <ol className="card divide-y divide-line">
              {items.map((entry) => {
                const meta = ACTOR_META[entry.actor];
                return (
                  <li key={entry.id} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        entry.actor === 'rule' ? 'bg-ai-gradient text-white' : 'bg-ink/5 text-muted'
                      }`}
                    >
                      <Icon name={meta.icon} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{entry.message}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {entry.actorName} ·{' '}
                        <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                          {timeLabel.format(new Date(entry.createdAt))}
                        </time>
                      </p>
                    </div>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
