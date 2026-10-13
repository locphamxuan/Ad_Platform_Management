import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { queryKeys } from '../lib/query-keys';
import { Icon } from './icons';

/** How often the owner's inbox is re-checked for new changes made by media buyers. */
const POLL_MS = 30_000;

/** Top-bar inbox: media buyers' campaign edits and deletes, marked read when opened. */
export function NotificationPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Remembered on open so the new items stay highlighted after they are marked read.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const { data } = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications.inbox, refetchInterval: POLL_MS });
  const markRead = useMutation({
    mutationFn: api.notifications.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setFreshIds(new Set(items.filter((n) => !n.readAt).map((n) => n.id)));
      if (unread > 0) markRead.mutate();
    }
    setOpen(!open);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="notification-list"
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        onClick={toggle}
        className="btn-icon relative"
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ai-gradient px-1 text-[0.625rem] font-bold tabular-nums text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id="notification-list"
          className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
        >
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Thông báo</p>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Chưa có thông báo nào.</li>}
            {items.map((n) => (
              <li key={n.id} className={`flex gap-3 px-4 py-3 text-sm ${freshIds.has(n.id) ? 'bg-accent-soft/60' : ''}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" style={{ opacity: freshIds.has(n.id) ? 1 : 0 }} />
                <div className="min-w-0">
                  <p className="text-ink">
                    <span className="font-semibold">{n.actorName}</span> {lowerFirst(n.message)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Messages read "Xoá chiến dịch …" on their own; after the actor's name they continue the sentence. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
