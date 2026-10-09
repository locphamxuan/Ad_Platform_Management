import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PlatformTag, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ROLE_META, ROLES } from '../../lib/constants';
import { formatDateTime, formatDecimal, formatNumber, formatVnd } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { Role } from '../../lib/types';

interface Range {
  from: string;
  to: string;
}

/** Below this ROAS a running campaign is flagged for the media buyer. */
const LOW_ROAS = 2;
const PROJECTION_DAYS = 30;

/**
 * The part of the dashboard that differs by role: each role sees what it is
 * responsible for, on top of the shared performance report.
 */
export function RoleFocus({ range }: { range: Range }) {
  const { user } = useAuth();
  if (!user) return null;
  const panels: Partial<Record<Role, ReactNode>> = {
    owner: <OwnerFocus range={range} />,
    admin: <AdminFocus />,
    media_buyer: <BuyerFocus range={range} />,
  };
  return panels[user.role] ?? null;
}

function useCampaigns(range: Range) {
  return useQuery({ queryKey: queryKeys.campaigns(range), queryFn: () => api.campaigns.list(range) });
}

function OwnerFocus({ range }: { range: Range }) {
  const users = useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
  const campaigns = useCampaigns(range);
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });

  const activeUsers = users.data?.filter((u) => u.active) ?? [];
  const runningBudget = (campaigns.data ?? [])
    .filter((c) => c.status === 'ACTIVE' && c.connected)
    .reduce((sum, c) => sum + c.dailyBudget, 0);
  const connected = integrations.data?.filter((i) => i.connected).length ?? 0;

  return (
    <FocusPanel role="owner" title="Toàn cảnh workspace" link={{ to: '/users', label: 'Quản lý thành viên' }}>
      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <Stat label="Ngân sách ngày đang chạy" value={formatVnd(runningBudget)} />
        <Stat label={`Dự kiến ${PROJECTION_DAYS} ngày`} value={formatVnd(runningBudget * PROJECTION_DAYS)} />
        <Stat label="Nền tảng kết nối" value={`${connected}/${integrations.data?.length ?? 0}`} />
        <Stat label="Thành viên hoạt động" value={`${activeUsers.length}/${users.data?.length ?? 0}`} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Thành viên theo vai trò">
        {ROLES.map((role) => (
          <li key={role}>
            <Tag>
              {ROLE_META[role].label}: <span className="ml-1 tabular-nums">{activeUsers.filter((u) => u.role === role).length}</span>
            </Tag>
          </li>
        ))}
      </ul>
    </FocusPanel>
  );
}

function AdminFocus() {
  const integrations = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });
  const users = useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
  const rules = useQuery({ queryKey: queryKeys.rules, queryFn: api.rules.list });
  const activity = useQuery({ queryKey: queryKeys.activity, queryFn: api.activity.list });

  const inactiveUsers = users.data?.filter((u) => !u.active).length ?? 0;
  const enabledRules = rules.data?.filter((r) => r.enabled).length ?? 0;

  return (
    <FocusPanel role="admin" title="Vận hành hệ thống" link={{ to: '/integrations', label: 'Quản lý kết nối' }}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <p className="eyebrow mb-2">Kết nối nền tảng</p>
          <ul className="space-y-2">
            {integrations.data?.map((i) => (
              <li key={i.platform} className="flex items-center justify-between gap-2">
                <PlatformTag platform={i.platform} />
                {i.connected ? <Tag tone="positive">Đã kết nối</Tag> : <Tag tone="caution">Mất kết nối</Tag>}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-lg border border-line bg-line">
          <Stat label="Rule đang bật" value={`${enabledRules}/${rules.data?.length ?? 0}`} />
          <Stat label="Tài khoản bị khoá" value={formatNumber(inactiveUsers)} />
        </div>
        <div className="min-w-0">
          <p className="eyebrow mb-2">Hoạt động gần nhất</p>
          <ul className="space-y-2">
            {activity.data?.slice(0, 3).map((entry) => (
              <li key={entry.id} className="min-w-0 text-sm">
                <p className="truncate" title={entry.message}>
                  {entry.message}
                </p>
                <p className="text-xs text-muted">
                  {entry.actorName} · {formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FocusPanel>
  );
}

function BuyerFocus({ range }: { range: Range }) {
  const campaigns = useCampaigns(range);
  const rules = useQuery({ queryKey: queryKeys.rules, queryFn: api.rules.list });

  const running = (campaigns.data ?? []).filter((c) => c.status === 'ACTIVE' && c.connected);
  const underperforming = running.filter((c) => c.kpis.roas < LOW_ROAS).sort((a, b) => a.kpis.roas - b.kpis.roas);
  const paused = (campaigns.data ?? []).filter((c) => c.status === 'PAUSED').length;
  const enabledRules = rules.data?.filter((r) => r.enabled).length ?? 0;

  return (
    <FocusPanel role="media_buyer" title="Việc cần xử lý" link={{ to: '/campaigns', label: 'Mở danh sách chiến dịch' }}>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="grid grid-cols-3 gap-px self-start overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-1">
          <Stat label="Đang chạy" value={formatNumber(running.length)} />
          <Stat label="Tạm dừng" value={formatNumber(paused)} />
          <Stat label="Rule đang bật" value={formatNumber(enabledRules)} />
        </div>
        <div className="min-w-0">
          <p className="eyebrow mb-2">ROAS dưới {LOW_ROAS}x trong kỳ</p>
          {underperforming.length === 0 ? (
            <p className="text-sm text-muted">Không có chiến dịch đang chạy nào dưới ngưỡng.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {underperforming.slice(0, 4).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium" title={c.name}>
                    {c.name}
                  </span>
                  <PlatformTag platform={c.platform} />
                  <span className="w-36 text-right tabular-nums text-muted">CPA {formatVnd(c.kpis.cpa)}</span>
                  <Tag tone="negative">
                    <span className="tabular-nums">ROAS {formatDecimal(c.kpis.roas)}x</span>
                  </Tag>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </FocusPanel>
  );
}

function FocusPanel({
  role,
  title,
  link,
  children,
}: {
  role: Role;
  title: string;
  link: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="card-pad border-l-4 border-l-accent">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Dành cho {ROLE_META[role].label}</p>
          <h2 className="mt-1 section-title">{title}</h2>
        </div>
        <Link to={link.to} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
          {link.label}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
