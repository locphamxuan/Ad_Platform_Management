import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';
import type { AudienceLocation, CampaignDraftPayload } from '../../../lib/types';
import { Field } from '../../../components/ui';

interface AudienceStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
  warnings?: Record<string, string>;
  expertMode?: boolean;
}

const INTEREST_SUGGESTIONS = [
  'Bất động sản',
  'Đầu tư tài chính',
  'Kinh doanh & Khởi nghiệp',
  'Thiết kế nội thất & Kiến trúc',
  'Mua sắm trực tuyến',
  'Du lịch nghỉ dưỡng',
  'Công nghệ & Thiết bị di động',
  'Xe hơi & Phương tiện',
];

export function AudienceStep({ payload, onChange, errors, expertMode }: AudienceStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const audience = payload.audience ?? {
    locations: 'VN',
    ageMin: 18,
    ageMax: 65,
    genders: ['MALE', 'FEMALE'],
    detailedTargeting: [],
    advantageExpansion: true,
  };

  const isHousing = payload.specialCategory === 'HOUSING';
  const isNationwide = audience.locations === 'VN';

  const locationsQuery = useQuery({
    queryKey: ['meta', 'locations', searchQuery],
    queryFn: () => api.meta.locations(searchQuery),
    enabled: !isNationwide && searchQuery.trim().length > 0,
  });

  const updateAudience = (patch: Partial<typeof audience>) => {
    onChange({ audience: { ...audience, ...patch } });
  };

  const addInterest = (name: string) => {
    if (!name.trim()) return;
    const cur = audience.detailedTargeting ?? [];
    if (!cur.includes(name.trim())) {
      updateAudience({ detailedTargeting: [...cur, name.trim()] });
    }
    setInterestInput('');
  };

  const removeInterest = (name: string) => {
    const cur = audience.detailedTargeting ?? [];
    updateAudience({ detailedTargeting: cur.filter((x) => x !== name) });
  };

  const handleAiSuggestInterests = () => {
    const defaults = ['Đầu tư tài chính', 'Bất động sản', 'Kinh doanh & Khởi nghiệp'];
    const cur = audience.detailedTargeting ?? [];
    const merged = Array.from(new Set([...cur, ...defaults]));
    updateAudience({ detailedTargeting: merged });
  };

  // Estimate audience size
  const baseReach = isNationwide ? 42_000_000 : (Array.isArray(audience.locations) ? audience.locations.length * 2_800_000 : 5_000_000);
  const ageFactor = Math.max(0.2, (audience.ageMax - audience.ageMin) / 47);
  const genderFactor = audience.genders.length === 2 ? 1 : 0.52;
  const estimatedMin = Math.round(baseReach * ageFactor * genderFactor * 0.7);
  const estimatedMax = Math.round(baseReach * ageFactor * genderFactor * 1.05);

  const setLocationMode = (mode: 'VN' | 'SPECIFIC') => {
    if (mode === 'VN') {
      onChange({
        audience: { ...audience, locations: 'VN' },
        acknowledgeNationwide: false,
      });
    } else {
      onChange({
        audience: { ...audience, locations: [] },
        acknowledgeNationwide: undefined,
      });
    }
  };

  const addLocation = (loc: AudienceLocation) => {
    const current = Array.isArray(audience.locations) ? audience.locations : [];
    if (!current.some((l) => l.key === loc.key)) {
      updateAudience({ locations: [...current, loc] });
    }
    setSearchQuery('');
  };

  const removeLocation = (key: string) => {
    const current = Array.isArray(audience.locations) ? audience.locations : [];
    updateAudience({ locations: current.filter((l) => l.key !== key) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Bước 3: Đối tượng mục tiêu & Địa điểm
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Xác định phạm vi địa lý, độ tuổi và giới tính của khách hàng tiềm năng.
        </p>
      </div>

      {/* Special Category Housing Warning */}
      {isHousing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <div className="text-xs">
              <div className="font-semibold">Tuân thủ chính sách Hạng mục Nhà ở (Meta Housing Policy)</div>
              <div className="mt-0.5">
                Vì chiến dịch được đánh dấu là Nhà ở, Meta yêu cầu nhắm tới toàn bộ độ tuổi (18–65) và tất cả giới tính để ngăn ngừa phân biệt đối xử. Các trường này đã được khoá cố định tự động.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Locations */}
      <Field label="Vị trí địa lý" error={errors?.locations} required>
        <div className="space-y-3">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                name="locationMode"
                checked={isNationwide}
                onChange={() => setLocationMode('VN')}
                className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Toàn quốc (Việt Nam)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                name="locationMode"
                checked={!isNationwide}
                onChange={() => setLocationMode('SPECIFIC')}
                className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Tỉnh / Thành phố cụ thể
            </label>
          </div>

          {isNationwide ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={payload.acknowledgeNationwide ?? false}
                  onChange={(e) => onChange({ acknowledgeNationwide: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Xác nhận phân phối toàn quốc
                  </div>
                  <div className="text-xs text-slate-500">
                    Tôi hiểu rằng quảng cáo sẽ tiếp cận người dùng trên toàn lãnh thổ 63 tỉnh/thành phố của Việt Nam (Quy tắc R8).
                  </div>
                </div>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Gõ tên tỉnh thành để tìm kiếm (ví dụ: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng...)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {locationsQuery.data && locationsQuery.data.length > 0 && searchQuery.trim() && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {locationsQuery.data.map((loc) => (
                      <button
                        key={loc.key}
                        type="button"
                        onClick={() => addLocation(loc)}
                        className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-200">{loc.name}</span>
                        <span className="text-xs text-slate-400">{loc.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected location tags */}
              <div className="flex flex-wrap gap-2">
                {Array.isArray(audience.locations) && audience.locations.map((loc) => (
                  <span
                    key={loc.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300"
                  >
                    {loc.name}
                    <button
                      type="button"
                      onClick={() => removeLocation(loc.key)}
                      className="hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Field>

      {/* Age Range */}
      <Field label="Độ tuổi mục tiêu" error={errors?.age} required>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs text-slate-500">Từ (Tuổi)</label>
            <select
              value={audience.ageMin}
              disabled={isHousing}
              onChange={(e) => updateAudience({ ageMin: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {Array.from({ length: 48 }, (_, i) => i + 18).map((age) => (
                <option key={age} value={age}>
                  {age} tuổi
                </option>
              ))}
            </select>
          </div>
          <span className="mt-5 text-slate-400">—</span>
          <div className="flex-1">
            <label className="block text-xs text-slate-500">Đến (Tuổi)</label>
            <select
              value={audience.ageMax}
              disabled={isHousing}
              onChange={(e) => updateAudience({ ageMax: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {Array.from({ length: 48 }, (_, i) => i + 18).map((age) => (
                <option key={age} value={age}>
                  {age === 65 ? '65+ tuổi' : `${age} tuổi`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Field>

      {/* Gender */}
      <Field label="Giới tính" error={errors?.genders} required>
        <div className="flex gap-4">
          {[
            { key: 'ALL', label: 'Tất cả', value: ['MALE', 'FEMALE'] as Array<'MALE' | 'FEMALE'> },
            { key: 'MALE', label: 'Nam', value: ['MALE'] as Array<'MALE' | 'FEMALE'> },
            { key: 'FEMALE', label: 'Nữ', value: ['FEMALE'] as Array<'MALE' | 'FEMALE'> },
          ].map((item) => {
            const isAll = item.key === 'ALL';
            const selected = isAll
              ? audience.genders.length === 2
              : audience.genders.length === 1 && audience.genders[0] === item.key;
            return (
              <label
                key={item.key}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-all ${
                  isHousing && !isAll ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                } ${
                  selected
                    ? 'border-blue-600 bg-blue-50/50 font-medium text-blue-700 dark:border-blue-500 dark:bg-blue-950/20 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="genderSelection"
                  disabled={isHousing}
                  checked={selected}
                  onChange={() => updateAudience({ genders: item.value })}
                  className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {item.label}
              </label>
            );
          })}
        </div>
      </Field>

      {/* Expert Mode Detailed Targeting & Reach Gauge */}
      {expertMode && (
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/20 p-5 dark:border-amber-900/30 dark:bg-amber-950/10">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Chuyên gia
            </span>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Nhắm mục tiêu chi tiết (Detailed Targeting) & Quy mô tiếp cận
            </div>
          </div>

          {/* Potential Reach Gauge Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">Ước tính quy mô tiếp cận tiềm năng (Potential Reach):</div>
                <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">
                  {estimatedMin.toLocaleString('vi-VN')} – {estimatedMax.toLocaleString('vi-VN')} người
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Quy mô đối tượng rộng tối ưu</span>
              </div>
            </div>

            {/* Gauge bar */}
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: '68%' }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>Quá hẹp (&lt; 100k)</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">Cân bằng tốt (~5M)</span>
                <span>Rất rộng (&gt; 30M)</span>
              </div>
            </div>
          </div>

          {/* Detailed Targeting */}
          <Field label="Sở thích & Hành vi chi tiết (Detailed Targeting)">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest(interestInput))}
                  placeholder="Nhập từ khóa sở thích rồi nhấn Enter..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => addInterest(interestInput)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  Thêm
                </button>
                <button
                  type="button"
                  onClick={handleAiSuggestInterests}
                  className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                >
                  Gợi ý AI ✨
                </button>
              </div>

              {/* Selected Interests Chips */}
              {(audience.detailedTargeting ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(audience.detailedTargeting ?? []).map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => removeInterest(item)}
                        className="text-blue-500 hover:text-blue-800 dark:hover:text-blue-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Quick suggestions */}
              <div>
                <div className="text-[11px] text-slate-400">Gợi ý nhanh theo ngành hàng:</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {INTEREST_SUGGESTIONS.map((item) => {
                    const active = (audience.detailedTargeting ?? []).includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => (active ? removeInterest(item) : addInterest(item))}
                        className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}
                      >
                        {active ? `✓ ${item}` : `+ ${item}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advantage+ Audience Expansion Switch */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Mở rộng đối tượng Advantage+ (Advantage+ Detailed Targeting)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Cho phép Meta mở rộng đối tượng khi thuật toán thấy khả năng tăng chuyển đổi với chi phí tốt hơn.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={audience.advantageExpansion ?? true}
                    onChange={(e) => updateAudience({ advantageExpansion: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

