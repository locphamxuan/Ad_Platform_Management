import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage, Loading, PageHeader, PlatformTag, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META } from '../../lib/constants';
import { formatDateTime, formatVnd } from '../../lib/format';
import { invalidateCampaignViews, queryKeys } from '../../lib/query-keys';
import type { Integration, Platform } from '../../lib/types';

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.integrations, queryFn: api.integrations.list });

  const toggle = useMutation({
    mutationFn: ({ platform, connect }: { platform: Platform; connect: boolean }) =>
      connect ? api.integrations.connect(platform) : api.integrations.disconnect(platform),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.integrations }),
        invalidateCampaignViews(queryClient),
      ]),
  });

  const onToggle = (integration: Integration) => {
    const disconnecting = integration.connected;
    if (disconnecting && !confirm(`Ngắt kết nối ${integration.displayName}? Số liệu của nền tảng này sẽ bị ẩn khỏi báo cáo.`)) {
      return;
    }
    toggle.mutate({ platform: integration.platform, connect: !disconnecting });
  };

  return (
    <>
      <PageHeader
        eyebrow="Thiết lập"
        title="Kết nối nền tảng"
        description="Kết nối tài khoản quảng cáo một lần, sau đó quản lý tất cả tại AdHub."
      />
      {!can('integration:manage') && (
        <p className="mb-5 text-sm text-muted">Chỉ Chủ sở hữu và Quản trị viên được thay đổi kết nối.</p>
      )}
      <div className="space-y-4">
        <ErrorMessage error={error ?? toggle.error} />
        {isLoading && <Loading />}
        <div className="grid gap-4 md:grid-cols-3">
          {data?.map((integration) => (
            <IntegrationCard
              key={integration.platform}
              integration={integration}
              canManage={can('integration:manage')}
              busy={toggle.isPending}
              onToggle={() => onToggle(integration)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function IntegrationCard({
  integration,
  canManage,
  busy,
  onToggle,
}: {
  integration: Integration;
  canManage: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="card flex flex-col">
      <div className="h-1 rounded-t-xl" style={{ background: PLATFORM_META[integration.platform].color }} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            <PlatformTag platform={integration.platform} />
          </h2>
          {integration.connected ? <Tag tone="positive">Đã kết nối</Tag> : <Tag>Chưa kết nối</Tag>}
        </div>
        <p className="mt-2 text-xs">
          {integration.live ? (
            <Tag tone="positive">API thật</Tag>
          ) : (
            <span className="text-muted">
              <Tag>Giả lập</Tag> Thao tác không gửi lên trình quản lý quảng cáo của nền tảng.
            </span>
          )}
        </p>

        <dl className="mt-5 flex-1 space-y-2.5 text-sm">
          {integration.connected ? (
            <>
              <Row label="Tài khoản" value={integration.accountName} />
              <Row label="Mã tài khoản" value={integration.accountId} mono />
              {integration.connectedAt && <Row label="Kết nối lúc" value={formatDateTime(integration.connectedAt)} />}
            </>
          ) : (
            <p className="text-muted">Đăng nhập OAuth để đồng bộ chiến dịch và số liệu.</p>
          )}
          <Row label="Ngân sách tối thiểu" value={`${formatVnd(integration.minDailyBudget)}/ngày`} />
        </dl>

        {canManage && (
          <button
            type="button"
            className={`${integration.connected ? 'btn-danger' : 'btn-primary'} mt-6 w-full`}
            disabled={busy}
            onClick={onToggle}
          >
            {integration.connected ? 'Ngắt kết nối' : `Kết nối ${PLATFORM_META[integration.platform].label}`}
          </button>
        )}
      </div>
    </article>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-medium ${mono ? 'font-mono text-xs' : ''}`} title={value}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
