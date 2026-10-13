import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/icons';
import { ErrorMessage, Loading, PageHeader, Tag } from '../../components/ui';
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

  const connected = data?.filter((i) => i.connected).length ?? 0;
  const live = data?.filter((i) => i.live).length ?? 0;

  return (
    <>
      <PageHeader
        icon="plug"
        eyebrow="Thiết lập"
        title="Kết nối nền tảng"
        description="Kết nối tài khoản quảng cáo một lần, sau đó quản lý tất cả tại AdHub."
      />
      {data && (
        <div className="card-ai mb-6 flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ai-gradient text-white">
            <Icon name="shield" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {connected}/{data.length} nền tảng đã kết nối · {live} dùng API thật
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {connected < data.length
                ? 'Kết nối thêm kênh để trợ lý so sánh hiệu quả và phân bổ ngân sách giữa các nền tảng.'
                : 'Đủ kênh — trợ lý đang so sánh hiệu quả giữa các nền tảng để đề xuất phân bổ ngân sách.'}
            </p>
          </div>
        </div>
      )}
      {!can('integration:manage') && <p className="mb-5 text-sm text-muted">Chỉ Chủ sở hữu được thay đổi kết nối.</p>}
      <div className="space-y-4">
        <ErrorMessage error={error ?? toggle.error} />
        {isLoading && <Loading rows={1} />}
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
  const meta = PLATFORM_META[integration.platform];
  return (
    <article className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
      <div className="relative h-20" style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}99)` }}>
        <span
          className="absolute -bottom-6 left-5 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-surface text-lg font-bold text-white"
          style={{ background: meta.color }}
          aria-hidden
        >
          {meta.label.charAt(0)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5 pt-9 sm:p-6 sm:pt-9">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold" translate="no">
            {meta.label}
          </h2>
          {integration.connected ? (
            <Tag tone="positive">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-positive" />
              Đã kết nối
            </Tag>
          ) : (
            <Tag>Chưa kết nối</Tag>
          )}
        </div>
        <p className="mt-2 text-xs">
          {integration.live ? (
            <Tag tone="accent">API thật</Tag>
          ) : (
            <span className="text-muted">
              <Tag tone="caution">Giả lập</Tag> Thao tác không gửi lên trình quản lý quảng cáo của nền tảng.
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
            <Icon name="plug" size={15} />
            {integration.connected ? 'Ngắt kết nối' : `Kết nối ${meta.label}`}
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
