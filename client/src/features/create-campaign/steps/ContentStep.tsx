import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect, type ChangeEvent, type DragEvent } from 'react';
import { api } from '../../../lib/api';
import type { CampaignDraftPayload, PageRef } from '../../../lib/types';
import { Field } from '../../../components/ui';

interface ContentStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
  warnings?: Record<string, string>;
  expertMode?: boolean;
}

const CTA_OPTIONS = [
  { value: 'LEARN_MORE', label: 'Tìm hiểu thêm' },
  { value: 'SIGN_UP', label: 'Đăng ký ngay' },
  { value: 'CONTACT_US', label: 'Liên hệ chúng tôi' },
  { value: 'ORDER_NOW', label: 'Đặt hàng ngay' },
  { value: 'APPLY_NOW', label: 'Ứng tuyển ngay' },
  { value: 'GET_QUOTE', label: 'Nhận báo giá' },
  { value: 'MESSAGING', label: 'Gửi tin nhắn (MESSAGING)' },
  { value: 'SHOP_NOW', label: 'Mua ngay (SHOP_NOW)' },
  { value: 'BOOK_TRAVEL', label: 'Đặt chỗ / Du lịch (BOOK_TRAVEL)' },
];

const getRatioLabel = (w: number, h: number) => {
  const ratio = w / h;
  if (Math.abs(ratio - 1) <= 0.05) return 'Vuông 1:1 (Feed)';
  if (Math.abs(ratio - 1.91) <= 0.15 || Math.abs(ratio - (16 / 9)) <= 0.1) return 'Ngang 1.91:1 / 16:9 (Web)';
  if (Math.abs(ratio - (9 / 16)) <= 0.08) return 'Dọc 9:16 (Story/Reel)';
  if (Math.abs(ratio - (4 / 5)) <= 0.08) return 'Dọc 4:5 (Feed Di Động)';
  return 'Tùy chỉnh';
};

export function ContentStep({ payload, onChange, errors, warnings, expertMode }: ContentStepProps) {
  const pagesQuery = useQuery({ queryKey: ['meta', 'pages'], queryFn: api.meta.pages });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; ratioLabel: string } | null>(null);

  const creative = payload.creative ?? { headline: '', primaryText: '', landingUrl: 'https://' };
  const selectedPages = payload.pages ?? [];
  const isFbSelected = payload.platforms?.includes('facebook');

  useEffect(() => {
    if (isFbSelected && selectedPages.length === 0 && pagesQuery.data && pagesQuery.data.length > 0) {
      const valid = pagesQuery.data.filter((p) => p.isAdvertisingAllowed !== false);
      if (valid.length > 0) {
        onChange({ pages: [valid[0]] });
      }
    }
  }, [isFbSelected, selectedPages.length, pagesQuery.data, onChange]);

  const updateCreative = (patch: Partial<typeof creative>) => {
    onChange({ creative: { ...creative, ...patch } });
  };

  const togglePage = (page: PageRef) => {
    const exists = selectedPages.some((p) => p.id === page.id);
    const next = exists
      ? selectedPages.filter((p) => p.id !== page.id)
      : [...selectedPages, page];
    onChange({ pages: next });
  };

  const selectAllPages = (all: PageRef[]) => {
    const valid = all.filter((p) => p.isAdvertisingAllowed !== false);
    onChange({ pages: valid });
  };

  const deselectAllPages = () => {
    onChange({ pages: [] });
  };

  const checkDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không thể kiểm tra kích thước hình ảnh'));
      };
      img.src = url;
    });
  };

  const processFile = async (file: File) => {
    setUploadError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Chỉ chấp nhận định dạng ảnh JPG, PNG hoặc WebP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Dung lượng hình ảnh tối đa 10MB');
      return;
    }

    try {
      const dims = await checkDimensions(file);
      if (dims.width < 200 || dims.height < 200) {
        setUploadError(`Kích thước hình ảnh tối thiểu là 200x200px (Ảnh bạn chọn: ${dims.width}x${dims.height}px)`);
        return;
      }
      setImageMeta({
        width: dims.width,
        height: dims.height,
        ratioLabel: getRatioLabel(dims.width, dims.height),
      });
    } catch {
      // Continue to upload if dimension check in browser fails
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const comma = res.indexOf(',');
          resolve(comma > -1 ? res.slice(comma + 1) : res);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataBase64 = await base64Promise;

      const asset = await api.media.upload(file.name, dataBase64);
      updateCreative({ imageId: asset.id });
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi khi tải ảnh lên máy chủ');
    } finally {
      setIsUploading(false);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Bước 2: Trang phân phối & Nội dung mẫu quảng cáo
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Chọn các Trang Fanpage đại diện và thiết kế nội dung quảng cáo bài viết ẩn (Dark Post).
        </p>
      </div>

      {/* Pages Selection for Facebook */}
      {isFbSelected && (
        <Field
          label="Trang Fanpage phân phối (Quảng cáo Dark Post)"
          error={errors?.pages}
          required
        >
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Đã chọn {selectedPages.length} trang</span>
            {pagesQuery.data && pagesQuery.data.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectAllPages(pagesQuery.data!)}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Chọn tất cả
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={deselectAllPages}
                  className="font-medium text-slate-500 hover:underline dark:text-slate-400"
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 dark:border-slate-800 dark:bg-slate-900/40">
            {pagesQuery.isLoading ? (
              <div className="py-4 text-center text-xs text-slate-400">Đang tải danh sách Trang...</div>
            ) : !pagesQuery.data || pagesQuery.data.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">Không tìm thấy Trang Fanpage nào có quyền quản lý</div>
            ) : (
              pagesQuery.data.map((page) => {
                const selected = selectedPages.some((p) => p.id === page.id);
                const isBlocked = page.isAdvertisingAllowed === false;
                return (
                  <label
                    key={page.id}
                    className={`flex items-center justify-between rounded-lg p-2.5 transition-colors ${
                      isBlocked
                        ? 'cursor-not-allowed opacity-50 bg-red-50/30 dark:bg-red-950/20'
                        : selected
                          ? 'bg-blue-50/60 ring-1 ring-blue-500/30 dark:bg-blue-950/30'
                          : 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={isBlocked}
                        onChange={() => togglePage(page)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {page.name}
                          </span>
                          {page.hasInstagram && (
                            <span className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Instagram
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">ID: {page.id}</div>
                      </div>
                    </div>

                    {isBlocked ? (
                      <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                        Hạn chế quảng cáo
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Sẵn sàng
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Mỗi Trang đã chọn sẽ tạo 1 quảng cáo Dark Post độc lập, không hiển thị trên dòng thời gian công khai của Trang (Quy tắc R1).
          </div>
        </Field>
      )}

      {/* Image Upload */}
      <Field label="Hình ảnh quảng cáo" error={uploadError} warning={warnings?.imageId}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
            dragOver
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/30'
          }`}
        >
          {creative.imageId ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative max-h-60 max-w-md overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex items-center justify-center p-1">
                <img
                  src={api.media.imageUrl(creative.imageId)}
                  alt="Creative"
                  className="max-h-56 w-auto object-contain rounded-md"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setImageMeta({
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        ratioLabel: getRatioLabel(img.naturalWidth, img.naturalHeight),
                      });
                    }
                  }}
                />
              </div>
              {imageMeta && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <span>{imageMeta.width} × {imageMeta.height} px • {imageMeta.ratioLabel}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Thay đổi hình ảnh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCreative({ imageId: undefined });
                    setImageMeta(null);
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                >
                  Xoá hình ảnh
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {isUploading ? 'Đang tải lên và xử lý...' : 'Kéo thả hình ảnh vào đây hoặc click để chọn tệp'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Định dạng JPG, PNG hoặc WebP. Tối thiểu 200x200px, dung lượng tối đa 10MB.
              </div>

              {/* Tỷ lệ đề xuất chuẩn Meta */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  📱 <strong>1:1 Vuông:</strong> 1080×1080 (Feed)
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  🖥️ <strong>1.91:1 Ngang:</strong> 1200×628 (Website/Link)
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  📲 <strong>9:16 Dọc:</strong> 1080×1920 (Story/Reel)
                </span>
              </div>

              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-3.5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isUploading ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Đang tải lên...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Chọn tệp ảnh từ máy tính
                  </>
                )}
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>
      </Field>

      {/* Copywriting */}
      <Field label="Tiêu đề quảng cáo (Headline)" error={errors?.headline} required>
        <input
          type="text"
          value={creative.headline}
          onChange={(e) => updateCreative({ headline: e.target.value })}
          placeholder="Ví dụ: Giảm 30% Đợt Mở Bán Đầu Tiên"
          maxLength={100}
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="mt-1 text-right text-xs text-slate-400">
          {creative.headline.length}/100 ký tự
        </div>
      </Field>

      <Field label="Nội dung chính (Primary Text)" error={errors?.primaryText} required>
        <textarea
          rows={4}
          value={creative.primaryText}
          onChange={(e) => updateCreative({ primaryText: e.target.value })}
          placeholder="Ví dụ: Cơ hội sở hữu căn hộ ven sông với tầm nhìn đắt giá. Đăng ký tham quan nhà mẫu ngay hôm nay để nhận voucher chiết khấu 100 triệu đồng."
          maxLength={500}
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="mt-1 text-right text-xs text-slate-400">
          {creative.primaryText.length}/500 ký tự
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Đường dẫn trang đích (Landing URL)" error={errors?.landingUrl} required>
          <input
            type="url"
            value={creative.landingUrl}
            onChange={(e) => updateCreative({ landingUrl: e.target.value })}
            placeholder="https://example.com/landing-page"
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </Field>

        <Field label="Nút kêu gọi hành động (Call To Action)">
          <select
            value={creative.cta ?? 'LEARN_MORE'}
            onChange={(e) => updateCreative({ cta: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {CTA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Expert Mode Technical Info & Lead Form */}
      {expertMode && (
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/20 p-5 dark:border-amber-900/30 dark:bg-amber-950/10">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Chuyên gia
            </span>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Mã kỹ thuật Dark Post & Biểu mẫu Lead Form
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Loại bài viết (Content Delivery Type)">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Dark Post (Unpublished Page Post - R1–R7)
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Bài viết quảng cáo ẩn, không hiển thị trên dòng thời gian công khai của Trang, tối ưu kiểm tra nhiều góc nội dung.
                </div>
              </div>
            </Field>

            <Field label="Biểu mẫu khách hàng tiềm năng (Lead Form ID)">
              {payload.objective === 'leads' ? (
                <input
                  type="text"
                  value={payload.advanced?.lead_form_id ?? ''}
                  onChange={(e) =>
                    onChange({
                      advanced: { ...payload.advanced, lead_form_id: e.target.value || undefined },
                    })
                  }
                  placeholder="Nhập mã Lead Form ID của Trang Facebook..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                  Chỉ áp dụng khi mục tiêu là Thu thập khách hàng tiềm năng (Leads).
                </div>
              )}
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

