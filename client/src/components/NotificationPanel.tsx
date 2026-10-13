import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { queryKeys } from '../lib/query-keys';

/** How often the owner's inbox is re-checked for new changes made by media buyers. */
const POLL_MS = 30_000;

/** Sidebar inbox: media buyers' campaign edits and deletes, marked read when opened. */
export function NotificationPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Remembered on open so the new items stay highlighted after they are marked read.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const { data } = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications.inbox, refetchInterval: POLL_MS });
  const markRead = useMutation({
    mutationFn: api.notifications.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  const toggle = () => {
    if (!open) {
      setFreshIds(new Set(items.filter((n) => !n.readAt).map((n) => n.id)));
      if (unread > 0) markRead.mutate();
    }
    setOpen(!open);
  };

  return (
    <div className="border-t border-white/10 px-3 py-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="notification-list"
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/[0.07] hover:text-white"
      >
        Thông báo
        {unread > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold tabular-nums text-white">
            {unread}
            <span className="sr-only"> chưa đọc</span>
          </span>
        )}
      </button>
      {open && (
        <ul id="notification-list" className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {items.length === 0 && <li className="px-3 py-2 text-xs text-white/50">Chưa có thông báo nào.</li>}
          {items.map((n) => (
            <li key={n.id} className={`rounded-lg px-3 py-2 text-xs ${freshIds.has(n.id) ? 'bg-white/10' : ''}`}>
              <p className="text-white/90">
                <span className="font-semibold">{n.actorName}</span> {lowerFirst(n.message)}
              </p>
              <p className="mt-0.5 text-white/45">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Messages read "Xoá chiến dịch …" on their own; after the actor's name they continue the sentence. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
