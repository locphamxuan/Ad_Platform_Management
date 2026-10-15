import { useState } from 'react';
import type { AbPlan, AbVariant, CampaignDraftPayload } from '../../../lib/types';
import { Field } from '../../../components/ui';

interface AbStudioStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
}

export function AbStudioStep({ payload, onChange, errors }: AbStudioStepProps) {
  const plan: AbPlan = payload.ab_plan ?? {
    enabled: true,
    variable: 'content',
    splitRatio: 50,
    metric: 'cpa',
    variants: [
      {
        key: 'A',
        name: 'Phương án A (Đối chứng)',
        value: {
          headline: payload.creative?.headline || 'Tiêu đề gốc',
          primaryText: payload.creative?.primaryText || 'Nội dung thông điệp gốc',
        },
      },
      {
        key: 'B',
        name: 'Phương án B (Thử nghiệm)',
        value: {
          headline: '',
          primaryText: '',
        },
      },
    ],
  };

  const [variable, setVariable] = useState<'content' | 'audience' | 'placements'>(
    plan.variable || 'content'
  );

  const updatePlan = (patch: Partial<AbPlan>) => {
    onChange({ ab_plan: { ...plan, ...patch } });
  };

  const handleVariableChange = (nextVar: 'content' | 'audience' | 'placements') => {
    setVariable(nextVar);
    let vA: AbVariant;
    let vB: AbVariant;

    if (nextVar === 'content') {
      vA = {
        key: 'A',
        name: 'Phương án A (Tiêu đề & Nội dung 1)',
        value: {
          headline: payload.creative?.headline || 'Tiêu đề bản chuẩn',
          primaryText: payload.creative?.primaryText || 'Thông điệp số 1',
        },
      };
      vB = {
        key: 'B',
        name: 'Phương án B (Tiêu đề & Nội dung 2)',
        value: {
          headline: 'Khám phá ưu đãi đặc biệt hôm nay',
          primaryText: 'Nội dung thông điệp cải biên hướng đến khách hàng mới',
        },
      };
    } else if (nextVar === 'audience') {
      vA = {
        key: 'A',
        name: 'Phương án A (Nhóm tuổi chuẩn 25-45)',
        value: {
          ageMin: 25,
          ageMax: 45,
          locations: payload.audience?.locations || 'VN',
        },
      };
      vB = {
        key: 'B',
        name: 'Phương án B (Nhóm tuổi trẻ 18-24)',
        value: {
          ageMin: 18,
          ageMax: 24,
          locations: payload.audience?.locations || 'VN',
        },
      };
    } else {
      vA = {
        key: 'A',
        name: 'Phương án A (Advantage+ Tự động)',
        value: { mode: 'auto' },
      };
      vB = {
        key: 'B',
        name: 'Phương án B (Chỉ Facebook & Instagram Feeds)',
        value: { mode: 'manual', list: ['facebook_feed', 'instagram_feed'] },
      };
    }

    updatePlan({
      variable: nextVar,
      variants: [vA, vB],
    });
  };

  const variants = plan.variants || [];
  const variantA = variants[0] || { key: 'A', name: 'Phương án A', value: {} };
  const variantB = variants[1] || { key: 'B', name: 'Phương án B', value: {} };

  const updateVariantB = (patchValue: Record<string, any>) => {
    const updatedB: AbVariant = {
      ...variantB,
      value: { ...variantB.value, ...patchValue },
    };
    updatePlan({
      variants: [variantA, updatedB],
    });
  };

  return (
    <div className="space-y-6" data-testid="ab-studio">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            A/B Testing
          </span>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Thiết kế thử nghiệm A/B (Split Testing)
          </h3>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          So sánh hiệu quả giữa 2 phương án đối chứng để tối ưu hóa chi phí và tỷ lệ chuyển đổi theo tiêu chuẩn Meta.
        </p>
      </div>

      {/* Scientific A/B Rule Banner */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-200">
        <div className="flex items-center gap-2 font-semibold">
          <span>🔬</span>
          <span>Quy tắc kiểm soát biến số khoa học:</span>
        </div>
        <div className="mt-1.5 leading-relaxed text-indigo-800/80 dark:text-indigo-300/80">
          Thử nghiệm A/B chỉ có giá trị khi <b>chỉ khác nhau DUY NHẤT một yếu tố</b>. Tất cả các yếu tố còn lại (ngân sách, thời gian chạy, đối tượng...) phải được giữ nguyên để xác định chính xác nguyên nhân mang lại kết quả tốt hơn.
        </div>
      </div>

      {/* 1. Chọn biến số cần thử */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          1. Bạn muốn thử nghiệm yếu tố nào?
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              id: 'content' as const,
              title: 'Nội dung (Creative & Copy)',
              desc: 'So sánh 2 thông điệp, tiêu đề hoặc hình ảnh quảng cáo khác nhau.',
            },
            {
              id: 'audience' as const,
              title: 'Khách hàng (Audience)',
              desc: 'So sánh phản hồi giữa 2 nhóm nhân khẩu học hoặc độ tuổi khác nhau.',
            },
            {
              id: 'placements' as const,
              title: 'Vị trí (Placements)',
              desc: 'So sánh hiệu quả giữa Advantage+ tự động và vị trí tự chọn (Feeds vs Reels).',
            },
          ].map((item) => {
            const active = variable === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleVariableChange(item.id)}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.title}</span>
                  <div
                    className={`h-3.5 w-3.5 rounded-full border ${
                      active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                </div>
                <span className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Cấu hình 2 biến thể A và B */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Variant A (Control) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                A
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Phương án A (Đối chứng)
              </span>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              50% Lưu lượng
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            {variable === 'content' && (
              <>
                <div>
                  <div className="text-slate-500">Tiêu đề (Headline):</div>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                    {payload.creative?.headline || 'Tiêu đề gốc'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Nội dung (Primary Text):</div>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                    {payload.creative?.primaryText || 'Nội dung thông điệp gốc'}
                  </div>
                </div>
              </>
            )}

            {variable === 'audience' && (
              <>
                <div>
                  <div className="text-slate-500">Nhóm tuổi:</div>
                  <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                    {payload.audience?.ageMin ?? 18} – {payload.audience?.ageMax ?? 65} tuổi
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Khu vực:</div>
                  <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                    {payload.audience?.locations === 'VN' ? 'Toàn quốc' : 'Tỉnh thành chọn lọc'}
                  </div>
                </div>
              </>
            )}

            {variable === 'placements' && (
              <div>
                <div className="text-slate-500">Vị trí hiển thị:</div>
                <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                  {payload.placements?.mode === 'manual' ? 'Tự chọn vị trí' : 'Advantage+ Tự động'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Variant B (Experiment) */}
        <div className="rounded-2xl border border-indigo-200 bg-white p-5 ring-1 ring-indigo-500/20 dark:border-indigo-900/40 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-3 dark:border-indigo-950">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                B
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Phương án B (Thử nghiệm)
              </span>
            </div>
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              50% Lưu lượng
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            {variable === 'content' && (
              <>
                <Field label="Tiêu đề thử nghiệm (Headline B)" error={errors?.headlineB} required>
                  <input
                    type="text"
                    value={variantB.value?.headline ?? ''}
                    onChange={(e) => updateVariantB({ headline: e.target.value })}
                    placeholder="Ví dụ: Giảm ngay 30% khi đăng ký sớm"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </Field>

                <Field label="Nội dung thử nghiệm (Primary Text B)" error={errors?.primaryTextB} required>
                  <textarea
                    rows={3}
                    value={variantB.value?.primaryText ?? ''}
                    onChange={(e) => updateVariantB({ primaryText: e.target.value })}
                    placeholder="Nhập thông điệp góc nhìn thứ 2 để đối chiếu tỷ lệ phản hồi..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </Field>
              </>
            )}

            {variable === 'audience' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tuổi từ">
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={variantB.value?.ageMin ?? 18}
                      onChange={(e) => updateVariantB({ ageMin: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                  </Field>
                  <Field label="Đến">
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={variantB.value?.ageMax ?? 30}
                      onChange={(e) => updateVariantB({ ageMax: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                  </Field>
                </div>
              </div>
            )}

            {variable === 'placements' && (
              <Field label="Vị trí hiển thị thử nghiệm">
                <select
                  value={variantB.value?.mode ?? 'manual'}
                  onChange={(e) => updateVariantB({ mode: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="auto">Tự động (Advantage+)</option>
                  <option value="manual">Chỉ Bảng tin Feed Facebook & Instagram</option>
                  <option value="reels">Chỉ Facebook & Instagram Reels</option>
                </select>
              </Field>
            )}
          </div>
        </div>
      </div>

      {/* 3. Tiêu chí xác định chiến thắng & Thời lượng */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          3. Tiêu chí đánh giá & Thời lượng thử nghiệm
        </h4>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Chỉ số quyết định phương án chiến thắng (Winning Metric)">
            <select
              value={plan.metric ?? 'cpa'}
              onChange={(e) => updatePlan({ metric: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="cpa">CPA thấp nhất (Chi phí mỗi khách hàng/kết quả thấp nhất)</option>
              <option value="ctr">CTR cao nhất (Tỷ lệ nhấp chuột vào quảng cáo cao nhất)</option>
              <option value="roas">ROAS cao nhất (Lợi tức trên chi tiêu quảng cáo cao nhất)</option>
            </select>
          </Field>

          <Field label="Thời lượng chạy thử nghiệm khuyến nghị">
            <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">7 ngày</span>
              <span className="ml-2 text-slate-500">(Đủ độ tin cậy thống kê ≥ 95% theo chuẩn Meta)</span>
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}

