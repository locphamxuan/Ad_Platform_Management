import type { CampaignDraftPayload, Objective, Platform, SpecialCategory } from '../../../lib/types';
import { OBJECTIVE_LABELS, PLATFORMS, PLATFORM_META } from '../../../lib/constants';
import { Field, PlatformTag } from '../../../components/ui';

interface GoalStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
}

export function GoalStep({ payload, onChange, errors }: GoalStepProps) {
  const selectedPlatforms = payload.platforms ?? ['facebook'];

  const togglePlatform = (p: Platform) => {
    let next: Platform[];
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length === 1) return; // Must have at least 1 platform
      next = selectedPlatforms.filter((item) => item !== p);
    } else {
      next = [...selectedPlatforms, p];
    }
    // Rebalance allocations
    const share = Math.round(100 / next.length);
    const allocations = next.map((plat, idx) => ({
      platform: plat,
      percentage: idx === next.length - 1 ? 100 - share * (next.length - 1) : share,
    }));
    onChange({ platforms: next, allocations });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Bước 1: Mục tiêu & Nền tảng quảng cáo
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Xác định mục tiêu chính của chiến dịch và lựa chọn các kênh phân phối phù hợp.
        </p>
      </div>

      <Field label="Tên chiến dịch" error={errors?.name} required>
        <input
          type="text"
          value={payload.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ví dụ: Chiến dịch Ra Mắt Căn Hộ Q4"
          maxLength={120}
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <div className="mt-1 text-right text-xs text-slate-400">
          {(payload.name ?? '').length}/120 ký tự
        </div>
      </Field>

      <Field label="Mục tiêu chiến dịch" error={errors?.objective} required>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(['awareness', 'traffic', 'leads', 'sales'] as Objective[]).map((obj) => {
            const active = payload.objective === obj;
            return (
              <button
                key={obj}
                type="button"
                onClick={() => onChange({ objective: obj })}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {OBJECTIVE_LABELS[obj]}
                  </span>
                  <div
                    className={`h-4 w-4 rounded-full border ${
                      active
                        ? 'border-blue-600 bg-blue-600 dark:border-blue-500'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                </div>
                <span className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {obj === 'awareness' && 'Tối đa hoá độ phủ và số người tiếp cận thương hiệu.'}
                  {obj === 'traffic' && 'Thúc đẩy lượt truy cập chất lượng vào liên kết/trang đích.'}
                  {obj === 'leads' && 'Thu thập khách hàng tiềm năng qua biểu mẫu và tin nhắn.'}
                  {obj === 'sales' && 'Tối ưu hoá chuyển đổi đơn hàng và doanh số bán hàng.'}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Nền tảng quảng cáo" error={errors?.platforms} required>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLATFORMS.map((p) => {
            const isSelected = selectedPlatforms.includes(p);
            const meta = PLATFORM_META[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`flex items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-white opacity-60 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <PlatformTag platform={p} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {meta.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p === 'facebook' ? 'Dark Post (R1-R7)' : 'Tự động đồng bộ'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Hạng mục quảng cáo đặc biệt (Meta Special Ad Category)">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={payload.specialCategory === 'HOUSING'}
              onChange={(e) => {
                const isHousing = e.target.checked;
                const cat: SpecialCategory = isHousing ? 'HOUSING' : 'NONE';
                const patch: Partial<CampaignDraftPayload> = { specialCategory: cat };
                if (isHousing && payload.audience) {
                  // Lock age to 18-65 and all genders for housing compliance
                  patch.audience = {
                    ...payload.audience,
                    ageMin: 18,
                    ageMax: 65,
                    genders: ['MALE', 'FEMALE'],
                  };
                }
                onChange(patch);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Chiến dịch thuộc lĩnh vực Nhà ở / Bất động sản (Housing)
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Theo chính sách Meta, các quảng cáo bán/cho thuê bất động sản, thế chấp hoặc dịch vụ liên quan bắt buộc phải khai báo hạng mục này. Độ tuổi sẽ được cố định 18–65 và nhắm tới tất cả giới tính để tuân thủ luật chống phân biệt đối xử.
              </div>
            </div>
          </label>
        </div>
      </Field>
    </div>
  );
}

