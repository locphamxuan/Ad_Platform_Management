import { useState } from 'react';
import type { AdvancedConfig, CampaignDraftPayload, PlacementsConfig } from '../../../lib/types';
import { Field } from '../../../components/ui';
import { formatVnd } from '../../../lib/format';

interface AdvancedStudioStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
}

const AVAILABLE_PLACEMENTS = [
  { id: 'facebook_feed', platform: 'Facebook', position: 'Bảng tin (Feed)', verified: true },
  { id: 'instagram_feed', platform: 'Instagram', position: 'Bảng tin (Feed)', verified: true },
  { id: 'facebook_stories', platform: 'Facebook', position: 'Tin (Stories)', verified: true },
  { id: 'instagram_stories', platform: 'Instagram', position: 'Tin (Stories)', verified: true },
  { id: 'facebook_reels', platform: 'Facebook', position: 'Reels', verified: true },
  { id: 'instagram_reels', platform: 'Instagram', position: 'Reels', verified: true },
  { id: 'facebook_marketplace', platform: 'Facebook', position: 'Marketplace', verified: false },
  { id: 'messenger_inbox', platform: 'Messenger', position: 'Hộp thư đến', verified: true },
  { id: 'audience_network', platform: 'Audience Network', position: 'Ứng dụng & Trang web đối tác', verified: false },
];

const OPTIMIZATION_GOALS = [
  { value: 'LINK_CLICKS', label: 'Lượt nhấp vào liên kết (LINK_CLICKS)', verified: true },
  { value: 'OFFSITE_CONVERSIONS', label: 'Lượt chuyển đổi trên trang web (OFFSITE_CONVERSIONS)', verified: true },
  { value: 'IMPRESSIONS', label: 'Lượt hiển thị (IMPRESSIONS)', verified: true },
  { value: 'REACH', label: 'Số người tiếp cận (REACH)', verified: true },
  { value: 'POST_ENGAGEMENT', label: 'Tương tác với bài viết (POST_ENGAGEMENT)', verified: true },
  { value: 'LEAD_GENERATION', label: 'Khách hàng tiềm năng (LEAD_GENERATION)', verified: true },
  { value: 'LANDING_PAGE_VIEWS', label: 'Lượt xem trang đích (LANDING_PAGE_VIEWS)', verified: true },
];

const BID_STRATEGIES = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Chi phí thấp nhất (Mặc định - không trần)', verified: true },
  { value: 'COST_CAP', label: 'Giới hạn chi phí (Cost Cap - kiểm soát CPA)', verified: true },
  { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Giới hạn giá thầu tối đa (Bid Cap)', verified: true },
  { value: 'MINIMUM_ROAS', label: 'ROAS mục tiêu tối thiểu (Advantage+ Catalog)', verified: false },
];

const ATTRIBUTION_WINDOWS = [
  { value: '7d_click_1d_view', label: '7 ngày sau nhấp hoặc 1 ngày sau xem (Chuẩn Meta)' },
  { value: '1d_click', label: '1 ngày sau khi nhấp' },
  { value: '7d_click', label: '7 ngày sau khi nhấp' },
];

const SPECIAL_CATEGORIES = [
  { id: 'NONE', label: 'Không có (Thông thường)' },
  { id: 'HOUSING', label: 'Nhà ở & Bất động sản' },
  { id: 'EMPLOYMENT', label: 'Cơ hội việc làm & Tuyển dụng' },
  { id: 'CREDIT', label: 'Dịch vụ tín dụng & Tài chính' },
  { id: 'ISSUES_ELECTIONS_POLITICS', label: 'Chính trị, Bầu cử & Vấn đề xã hội' },
];

const DAYS_OF_WEEK = [
  { day: 0, label: 'CN' },
  { day: 1, label: 'T2' },
  { day: 2, label: 'T3' },
  { day: 3, label: 'T4' },
  { day: 4, label: 'T5' },
  { day: 5, label: 'T6' },
  { day: 6, label: 'T7' },
];

export function AdvancedStudioStep({ payload, onChange, errors }: AdvancedStudioStepProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const advanced: AdvancedConfig = payload.advanced ?? {};
  const placements: PlacementsConfig = payload.placements ?? { mode: 'preset', list: [] };

  const updateAdvanced = (patch: Partial<AdvancedConfig>) => {
    onChange({ advanced: { ...advanced, ...patch } });
  };

  const updatePlacements = (patch: Partial<PlacementsConfig>) => {
    onChange({ placements: { ...placements, ...patch } });
  };

  // Derive billing event from optimization goal
  const derivedBillingEvent =
    advanced.optimization_goal === 'LINK_CLICKS' ? 'LINK_CLICKS' : 'IMPRESSIONS';

  const generateAiUtm = () => {
    const slug = (payload.name || 'campaign')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const utm = `utm_source=facebook&utm_medium=paid&utm_campaign=${slug}&utm_content=${payload.objective || 'traffic'}`;
    updateAdvanced({ url_tags: utm });
  };

  return (
    <div className="space-y-6" data-testid="advanced-studio">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Chuyên gia
          </span>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Cài đặt nâng cao (Advanced Studio)
          </h3>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Các lựa chọn kỹ thuật chuyên sâu tuân thủ Meta Graph API v21.0. Tổ hợp chưa kiểm chứng sẽ được gắn cảnh báo để kiểm soát rủi ro.
        </p>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
        <div className="font-semibold">Nguyên tắc kiểm soát tham số kỹ thuật Meta:</div>
        <div className="mt-1 text-blue-800/80 dark:text-blue-300/80">
          Chế độ chuyên gia mở khóa trực tiếp các trường kỹ thuật của Meta Ad Set và Creative. Hệ thống tự động tính toán tính hợp lệ và cảnh báo xung đột nếu tổ hợp tham số không được Meta hỗ trợ.
        </div>
      </div>

      {/* 1. Vị trí hiển thị (Placements) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          1. Vị trí hiển thị quảng cáo (Placements)
        </h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Kiểm soát nơi quảng cáo xuất hiện trên hệ sinh thái Meta (Facebook, Instagram, Messenger).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              mode: 'preset' as const,
              title: 'Được đề xuất (Preset)',
              desc: 'Tổ hợp vị trí đã được Meta chấp nhận và kiểm chứng hiệu quả cho mục tiêu này.',
            },
            {
              mode: 'auto' as const,
              title: 'Tự động (Advantage+)',
              desc: 'Để thuật toán Meta tự phân phối vị trí hiển thị tối ưu chi phí theo thời gian thực.',
            },
            {
              mode: 'manual' as const,
              title: 'Tự chọn (Manual)',
              desc: 'Tự cấu hình từng vị trí bảng tin, reels, stories hoặc ứng dụng đối tác.',
            },
          ].map((item) => {
            const active = (placements.mode ?? 'preset') === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => updatePlacements({ mode: item.mode })}
                className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.title}</span>
                  <div
                    className={`h-3.5 w-3.5 rounded-full border ${
                      active ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                </div>
                <span className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Manual placement checkboxes */}
        {placements.mode === 'manual' && (
          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Chọn các vị trí muốn hiển thị:
            </div>
            {errors?.placements && (
              <div className="text-xs font-medium text-rose-500">{errors.placements}</div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {AVAILABLE_PLACEMENTS.map((p) => {
                const checked = (placements.list ?? []).includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = placements.list ?? [];
                        const next = e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id);
                        updatePlacements({ list: next });
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 font-medium">
                      {p.platform} — {p.position}
                    </span>
                    {p.verified ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        ✓ đã kiểm chứng
                      </span>
                    ) : (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        chưa kiểm chứng
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Tối ưu & Giá thầu (Optimization & Bidding) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          2. Tối ưu hoá & Chiến lược giá thầu
        </h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Quyết định cách thuật toán Meta tìm kiếm kết quả và đấu giá trong phiên hiển thị.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cách tối ưu (Optimization Goal)" error={errors?.optimization_goal}>
            <select
              value={advanced.optimization_goal ?? ''}
              onChange={(e) => updateAdvanced({ optimization_goal: e.target.value || undefined })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Mặc định theo mục tiêu chiến dịch</option>
              {OPTIMIZATION_GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Chiến lược giá thầu (Bid Strategy)" error={errors?.bid_strategy}>
            <select
              value={advanced.bid_strategy ?? 'LOWEST_COST_WITHOUT_CAP'}
              onChange={(e) => updateAdvanced({ bid_strategy: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {BID_STRATEGIES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label} {b.verified ? '✓' : '(chưa kiểm chứng)'}
                </option>
              ))}
            </select>
          </Field>

          {(advanced.bid_strategy === 'COST_CAP' || advanced.bid_strategy === 'LOWEST_COST_WITH_BID_CAP') && (
            <Field label="Mức giá thầu kiểm soát (₫)" error={errors?.bid_amount} required>
              <div className="relative">
                <input
                  type="number"
                  step={500}
                  min={500}
                  value={advanced.bid_amount ?? ''}
                  onChange={(e) => updateAdvanced({ bid_amount: Number(e.target.value) || undefined })}
                  placeholder="Ví dụ: 15.000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400">₫ / kết quả</span>
              </div>
              {advanced.bid_amount && (
                <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                  {formatVnd(advanced.bid_amount)} cho mỗi kết quả mục tiêu
                </div>
              )}
            </Field>
          )}

          <Field label="Sự kiện tính phí (Billing Event)">
            <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="font-mono font-semibold">{derivedBillingEvent}</span>
              <span className="ml-2 text-slate-400">(Tự động suy ra theo cách tối ưu đã chọn)</span>
            </div>
          </Field>

          <Field label="Đích đến chuyển đổi (Destination Type)">
            <select
              value={advanced.destination_type ?? ''}
              onChange={(e) => updateAdvanced({ destination_type: e.target.value || undefined })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Mặc định hệ thống</option>
              <option value="WEBSITE">Website / Trang đích (WEBSITE)</option>
              <option value="MESSENGER">Tin nhắn Messenger (MESSENGER)</option>
              <option value="ON_AD">Trên quảng cáo (ON_AD)</option>
              <option value="WHATSAPP">WhatsApp (WHATSAPP)</option>
              <option value="INSTAGRAM_DIRECT">Instagram Direct (INSTAGRAM_DIRECT)</option>
            </select>
          </Field>
        </div>
      </div>

      {/* 3. Ghi nhận & Theo dõi (Attribution & UTM) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          3. Cửa sổ ghi nhận & Tham số theo dõi (UTM)
        </h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Cửa sổ ghi nhận xác định khung thời gian Meta tính chuyển đổi sau khi người dùng nhấp hoặc xem quảng cáo.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cửa sổ ghi nhận (Attribution Window)">
            <select
              value={advanced.attribution_window ?? ''}
              onChange={(e) => updateAdvanced({ attribution_window: e.target.value || undefined })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Mặc định của Meta (Khuyên dùng)</option>
              {ATTRIBUTION_WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tham số URL Tags (UTM Tracking)" error={errors?.url_tags}>
            <div className="flex gap-2">
              <input
                type="text"
                value={advanced.url_tags ?? ''}
                onChange={(e) => updateAdvanced({ url_tags: e.target.value || undefined })}
                placeholder="utm_source=facebook&utm_medium=paid&utm_campaign=..."
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={generateAiUtm}
                className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
              >
                Gợi ý UTM ✨
              </button>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Gắn tự động vào liên kết quảng cáo để đối soát trên Google Analytics 4 và CRM nội bộ.
            </div>
          </Field>
        </div>
      </div>

      {/* 4. Lịch chạy theo giờ (Dayparting) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              4. Lịch phân phối theo giờ (Dayparting)
            </h4>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Chỉ chạy quảng cáo trong các khung giờ vàng trong ngày. (Quy định Meta: áp dụng với ngân sách Trọn đợt).
            </p>
          </div>
          {advanced.dayparting && (
            <button
              type="button"
              onClick={() => updateAdvanced({ dayparting: undefined })}
              className="text-xs text-rose-600 hover:underline dark:text-rose-400"
            >
              Bỏ lịch theo giờ
            </button>
          )}
        </div>

        {errors?.dayparting && (
          <div className="mt-2 text-xs font-medium text-rose-500">{errors.dayparting}</div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {DAYS_OF_WEEK.map((d) => {
              const active = advanced.dayparting?.days?.includes(d.day) ?? false;
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => {
                    const currentDays = advanced.dayparting?.days ?? [1, 2, 3, 4, 5, 6, 0];
                    const nextDays = active
                      ? currentDays.filter((x) => x !== d.day)
                      : [...currentDays, d.day];
                    updateAdvanced({
                      dayparting: {
                        days: nextDays,
                        from_hour: advanced.dayparting?.from_hour ?? 8,
                        to_hour: advanced.dayparting?.to_hour ?? 22,
                      },
                    });
                  }}
                  className={`flex h-8 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>Từ</span>
            <select
              value={advanced.dayparting?.from_hour ?? 8}
              onChange={(e) =>
                updateAdvanced({
                  dayparting: {
                    days: advanced.dayparting?.days ?? [1, 2, 3, 4, 5, 6, 0],
                    from_hour: Number(e.target.value),
                    to_hour: advanced.dayparting?.to_hour ?? 22,
                  },
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
            <span>đến</span>
            <select
              value={advanced.dayparting?.to_hour ?? 22}
              onChange={(e) =>
                updateAdvanced({
                  dayparting: {
                    days: advanced.dayparting?.days ?? [1, 2, 3, 4, 5, 6, 0],
                    from_hour: advanced.dayparting?.from_hour ?? 8,
                    to_hour: Number(e.target.value),
                  },
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h + 1}>
                  {h + 1}:00
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 5. Hạng mục đặc biệt Meta */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          5. Danh mục quảng cáo đặc biệt (Special Ad Categories)
        </h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Tuân thủ chính sách chống phân biệt đối xử của Meta. Khi chọn một danh mục, tính năng nhắm mục tiêu tuổi, giới tính và vị trí hẹp sẽ bị khóa tự động.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {SPECIAL_CATEGORIES.map((cat) => {
            const active =
              cat.id === 'NONE'
                ? (!advanced.special_ad_categories || advanced.special_ad_categories.length === 0)
                : (advanced.special_ad_categories ?? []).includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (cat.id === 'NONE') {
                    updateAdvanced({ special_ad_categories: [] });
                    onChange({ specialCategory: 'NONE' });
                  } else {
                    const cur = advanced.special_ad_categories ?? [];
                    const next = cur.includes(cat.id) ? cur.filter((x) => x !== cat.id) : [...cur, cat.id];
                    updateAdvanced({ special_ad_categories: next });
                    onChange({ specialCategory: next.includes('HOUSING') ? 'HOUSING' : 'NONE' });
                  }
                }}
                className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. Chẩn đoán & Dữ liệu kỹ thuật thô */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              6. Chẩn đoán cấu trúc kỹ thuật (Diagnostics & Raw Data)
            </h4>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Đối soát trực tiếp payload JSON sẽ được gửi lên Meta Graph API.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRawJson((v) => !v)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {showRawJson ? 'Ẩn dữ liệu thô' : 'Xem dữ liệu thô (JSON)'}
          </button>
        </div>

        {showRawJson && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-emerald-400 dark:border-slate-800">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Meta Graph API Ad Set & Creative Payload:
            </div>
            <pre className="max-h-60 overflow-x-auto font-mono text-[11px] leading-relaxed">
              {JSON.stringify(
                {
                  objective: payload.objective,
                  buying_type: payload.buying_type || 'AUCTION',
                  placements,
                  advanced,
                  budget: payload.totalDailyBudget,
                  allocations: payload.allocations,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

