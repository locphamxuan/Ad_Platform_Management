import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';
import type { Campaign, CampaignDraft, CheckLevelResult } from '../../../lib/types';
import { OBJECTIVE_LABELS } from '../../../lib/constants';
import { formatVnd } from '../../../lib/format';
import { describeSchedule } from '../../../lib/schedule';
import { metaAdsManagerUrl } from '../../../lib/ads-manager';
import { AdPreview } from '../../../components/AdPreview';
import { PlatformTag } from '../../../components/ui';

interface ReviewStepProps {
  draft: CampaignDraft;
  onSubmitted: (campaign: Campaign) => void;
  onBackToStep: (step: number) => void;
}

export function ReviewStep({ draft, onSubmitted, onBackToStep }: ReviewStepProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(() => draft.payload.pages?.[0]?.id ?? 'default');
  const [selectedPlacement, setSelectedPlacement] = useState<string>('DESKTOP_FEED_STANDARD');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState<Campaign | null>(null);

  // Check 4 levels
  const checkQuery = useQuery({
    queryKey: ['drafts', draft.id, 'check'],
    queryFn: () => api.drafts.check(draft.id),
  });

  // Previews
  const previewsQuery = useQuery({
    queryKey: ['drafts', draft.id, 'previews'],
    queryFn: () => api.drafts.previews(draft.id),
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: () => api.drafts.submit(draft.id),
    onSuccess: (campaign) => {
      setCreatedCampaign(campaign);
      setShowConfirmModal(false);
      onSubmitted(campaign);
    },
  });

  const payload = draft.payload;
  const pages = payload.pages ?? [];
  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? pages[0];
  const pagePreviews = previewsQuery.data?.[selectedPageId] ?? [];
  const activePreview = pagePreviews.find((p) => p.placement === selectedPlacement) ?? pagePreviews[0];

  const checkResults = checkQuery.data ?? draft.check?.levels ?? [];
  const hasValidationErrors = checkResults.some((r) => r.status === 'FAILED');

  const levelName = (level: CheckLevelResult['level']) => {
    switch (level) {
      case 'CAMPAIGN':
        return '1. Cấp Chiến dịch (Campaign)';
      case 'AD_SET':
        return '2. Cấp Nhóm quảng cáo (Ad Set)';
      case 'AD_CREATIVE':
        return '3. Cấp Mẫu quảng cáo (Creative)';
      case 'AD':
        return '4. Cấp Quảng cáo theo Trang (Ad)';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Bước 5: Xác minh & Tạo chiến dịch trên Meta
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Kiểm tra toàn bộ cấu hình, kết quả xác minh 4 cấp độ và xem trước mẫu quảng cáo thực tế.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/40">
        <div>
          <div className="text-xs text-slate-500">Mục tiêu</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {OBJECTIVE_LABELS[payload.objective]}
          </div>
          <button
            type="button"
            onClick={() => onBackToStep(1)}
            className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Sửa mục tiêu →
          </button>
        </div>

        <div>
          <div className="text-xs text-slate-500">Kênh & Fanpage</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {payload.platforms?.map((p) => (
              <PlatformTag key={p} platform={p} />
            ))}
            <span className="text-xs text-slate-600 dark:text-slate-300">
              ({pages.length} Fanpage)
            </span>
          </div>
          <button
            type="button"
            onClick={() => onBackToStep(2)}
            className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Sửa Fanpage →
          </button>
        </div>

        <div>
          <div className="text-xs text-slate-500">Đối tượng & Vị trí</div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {payload.audience?.locations === 'VN'
              ? 'Toàn quốc (Việt Nam)'
              : `${payload.audience?.locations.length ?? 0} tỉnh thành`}
          </div>
          <div className="text-xs text-slate-400">
            Độ tuổi: {payload.audience?.ageMin}–{payload.audience?.ageMax} tuổi
          </div>
          <button
            type="button"
            onClick={() => onBackToStep(3)}
            className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Sửa đối tượng →
          </button>
        </div>

        <div>
          <div className="text-xs text-slate-500">Ngân sách & Lịch chạy</div>
          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {formatVnd(payload.totalDailyBudget ?? 0)} / ngày
          </div>
          <div className="text-xs text-slate-400 truncate">
            {describeSchedule(payload.schedule)}
          </div>
          <button
            type="button"
            onClick={() => onBackToStep(4)}
            className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Sửa ngân sách →
          </button>
        </div>
      </div>

      {/* 4-Level Validation Results */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Kết quả kiểm tra trước khi gửi (Meta 4-Level Validation)
          </h4>
          <button
            type="button"
            onClick={() => checkQuery.refetch()}
            disabled={checkQuery.isFetching}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
          >
            {checkQuery.isFetching ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {checkResults.map((result, idx) => {
              const isPassed = result.status === 'PASSED';
              return (
                <div
                  key={`${result.level}_${result.pageId ?? idx}`}
                  className={`flex items-start justify-between p-3.5 ${
                    isPassed
                      ? 'bg-white dark:bg-slate-900'
                      : 'bg-red-50/50 dark:bg-red-950/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isPassed ? (
                        <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {levelName(result.level)}
                        {result.pageId && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            (Trang: {pages.find((p) => p.id === result.pageId)?.name ?? result.pageId})
                          </span>
                        )}
                      </div>
                      {result.message && (
                        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {result.message}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      isPassed
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                    }`}
                  >
                    {isPassed ? 'HỢP LỆ' : 'KHÔNG HỢP LỆ'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ad Previews Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Xem trước mẫu quảng cáo theo Trang & Vị trí hiển thị
          </h4>
        </div>

        {/* Page Tabs */}
        {pages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPageId(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedPageId === p.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Placement Format Tabs */}
        <div className="flex gap-2">
          {[
            { id: 'DESKTOP_FEED_STANDARD', label: 'Bảng tin máy tính' },
            { id: 'MOBILE_FEED_STANDARD', label: 'Bảng tin di động' },
            ...(selectedPage?.hasInstagram ? [{ id: 'INSTAGRAM_STANDARD', label: 'Instagram Feed' }] : []),
          ].map((placement) => (
            <button
              key={placement.id}
              type="button"
              onClick={() => setSelectedPlacement(placement.id)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                selectedPlacement === placement.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
              }`}
            >
              {placement.label}
            </button>
          ))}
        </div>

        {/* Preview Frame */}
        <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-100 p-6 dark:border-slate-800 dark:bg-slate-950">
          {activePreview?.iframeHtml ? (
            <div
              className="max-w-md w-full overflow-hidden rounded-lg bg-white shadow dark:bg-slate-900"
              dangerouslySetInnerHTML={{ __html: activePreview.iframeHtml }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                BẢN MÔ PHỎNG — CHƯA XÁC MINH VỚI META
              </span>
              <div className="w-80">
                <AdPreview
                  platform="facebook"
                  creative={payload.creative ?? { headline: '', primaryText: '', landingUrl: '' }}
                  pageName={selectedPage?.name}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Submit Action */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-6 dark:border-blue-900/40 dark:bg-blue-950/20">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Sẵn sàng tạo chiến dịch trên Meta?
            </h4>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Chiến dịch sẽ được tạo ở trạng thái <strong>TẠM DỪNG (PAUSED)</strong> trên Meta để đảm bảo an toàn ngân sách (Quy tắc R2). Bạn sẽ kích hoạt chiến dịch trực tiếp trên Meta Ads Manager (Quy tắc R3).
            </p>
          </div>

          <button
            type="button"
            disabled={hasValidationErrors || submitMutation.isPending}
            onClick={() => setShowConfirmModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitMutation.isPending ? 'Đang tạo trên Meta...' : 'Tạo trên Meta (Tạm dừng)'}
          </button>
        </div>

        {submitMutation.isError && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {submitMutation.error instanceof Error
              ? submitMutation.error.message
              : 'Có lỗi xảy ra khi tạo chiến dịch trên Meta'}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Xác nhận tạo chiến dịch trên Meta
            </h3>
            <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {payload.name}
                </div>
                <div className="mt-1 text-slate-500">
                  Ngân sách: {formatVnd(payload.totalDailyBudget ?? 0)} / ngày • {pages.length} Fanpage
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                <strong>Lưu ý quan trọng (Quy tắc R2 & R3):</strong>
                <ul className="mt-1 list-disc pl-4 space-y-1">
                  <li>Chiến dịch sẽ được tạo với trạng thái <strong>TẠM DỪNG (PAUSED)</strong>.</li>
                  <li>Tất cả quảng cáo Dark Post và Nhóm quảng cáo ở trạng thái <strong>ACTIVE</strong>.</li>
                  <li>Không kích hoạt trực tiếp tại AdHub — bạn cần vào <strong>Meta Ads Manager</strong> để kiểm duyệt và kích hoạt chiến dịch.</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? 'Đang tạo...' : 'Xác nhận tạo (Tạm dừng)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal with Ads Manager Deep Link */}
      {createdCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
              Chiến dịch đã tạo thành công trên Meta!
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Chiến dịch <strong>{createdCampaign.name}</strong> hiện đang ở trạng thái TẠM DỪNG (PAUSED). Vui lòng mở Meta Ads Manager để kích hoạt chiến dịch.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <a
                href={metaAdsManagerUrl(createdCampaign.accountId, createdCampaign.externalId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700"
              >
                Mở trên Meta Ads Manager ↗
              </a>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/campaigns/${createdCampaign.id}`;
                }}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Xem chi tiết tại AdHub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

