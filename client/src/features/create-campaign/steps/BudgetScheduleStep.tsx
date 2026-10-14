import type { CampaignDraftPayload, Platform } from '../../../lib/types';
import { PLATFORM_META } from '../../../lib/constants';
import { formatVnd } from '../../../lib/format';
import { describeSchedule, estimateCostVnd } from '../../../lib/schedule';
import { Field, PlatformTag } from '../../../components/ui';

interface BudgetScheduleStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
  warnings?: Record<string, string>;
  dailyBudgetLimit?: number | null;
}

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

export function BudgetScheduleStep({
  payload,
  onChange,
  errors,
  warnings,
  dailyBudgetLimit,
}: BudgetScheduleStepProps) {
  const totalBudget = payload.totalDailyBudget ?? 1_000_000;
  const allocations = payload.allocations ?? [{ platform: 'facebook', percentage: 100 }];
  const schedule = payload.schedule ?? {};

  const totalPercent = allocations.reduce((sum, a) => sum + (a.percentage ?? a.percent ?? 0), 0);
  const costEstimate = estimateCostVnd(totalBudget, schedule);

  const updateAllocation = (platform: Platform, percent: number) => {
    const next = allocations.map((a) => (a.platform === platform ? { ...a, percentage: percent } : a));
    onChange({ allocations: next });
  };

  const updateSchedule = (patch: Partial<typeof schedule>) => {
    onChange({ schedule: { ...schedule, ...patch } });
  };

  // Helper format datetime for datetime-local input (YYYY-MM-DDTHH:mm)
  const toInputDatetime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const fromInputDatetime = (val: string) => {
    if (!val) return undefined;
    try {
      return new Date(val).toISOString();
    } catch {
      return undefined;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Bước 4: Ngân sách & Lịch chạy
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Thiết lập ngân sách hàng ngày, phân bổ theo kênh và thời gian chạy chiến dịch.
        </p>
      </div>

      {/* Daily Budget */}
      <Field label="Tổng ngân sách hàng ngày (VND)" error={errors?.totalDailyBudget} required>
        <div className="space-y-2">
          <div className="relative">
            <input
              type="number"
              step={50_000}
              min={50_000}
              value={totalBudget}
              onChange={(e) => onChange({ totalDailyBudget: Math.max(0, Number(e.target.value)) })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base font-semibold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="absolute right-3.5 top-2.5 text-sm font-medium text-slate-400">₫ / ngày</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ totalDailyBudget: preset })}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  totalBudget === preset
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {formatVnd(preset)}
              </button>
            ))}
          </div>

          {dailyBudgetLimit && (
            <div className="text-xs text-slate-500">
              Giới hạn ngân sách tối đa của bạn:{' '}
              <strong className="text-slate-700 dark:text-slate-300">{formatVnd(dailyBudgetLimit)} / ngày</strong>
            </div>
          )}
        </div>
      </Field>

      {/* Allocations */}
      <Field label="Phân bổ ngân sách theo kênh (%)" error={errors?.allocations} required>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Tỷ lệ phân bổ:</span>
            <span
              className={`font-semibold ${
                Math.round(totalPercent) === 100
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              Tổng: {totalPercent}% / 100%
            </span>
          </div>

          {allocations.map((alloc) => {
            const p = alloc.percentage ?? alloc.percent ?? 0;
            const channelBudget = Math.round((totalBudget * p) / 100);
            const warn = warnings?.[alloc.platform];
            return (
              <div key={alloc.platform} className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlatformTag platform={alloc.platform} />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {PLATFORM_META[alloc.platform]?.label ?? alloc.platform}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {formatVnd(channelBudget)}
                    </span>
                    <span className="text-xs text-slate-400"> ({p}%)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={p}
                    onChange={(e) => updateAllocation(alloc.platform, Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-slate-700"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p}
                    onChange={(e) => updateAllocation(alloc.platform, Number(e.target.value))}
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-xs font-semibold dark:border-slate-600 dark:bg-slate-900"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>

                {warn && <div className="text-[11px] text-amber-600 dark:text-amber-400">{warn}</div>}
              </div>
            );
          })}
        </div>
      </Field>

      {/* Schedule */}
      <Field label="Lịch chạy chiến dịch" error={errors?.startTime || errors?.endTime}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Start Time */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Thời gian bắt đầu</div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="radio"
                name="startSchedule"
                checked={!schedule.startTime}
                onChange={() => updateSchedule({ startTime: undefined })}
                className="h-3.5 w-3.5 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Bắt đầu ngay sau khi được duyệt
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="radio"
                name="startSchedule"
                checked={Boolean(schedule.startTime)}
                onChange={() =>
                  updateSchedule({
                    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                  })
                }
                className="h-3.5 w-3.5 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Lên lịch ngày giờ cụ thể
            </label>
            {schedule.startTime && (
              <input
                type="datetime-local"
                value={toInputDatetime(schedule.startTime)}
                onChange={(e) => updateSchedule({ startTime: fromInputDatetime(e.target.value) })}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            )}
            <div className="text-[10px] text-slate-400">Múi giờ Việt Nam: UTC+7</div>
          </div>

          {/* End Time */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Thời gian kết thúc</div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="radio"
                name="endSchedule"
                checked={!schedule.endTime}
                onChange={() => updateSchedule({ endTime: undefined })}
                className="h-3.5 w-3.5 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Chạy liên tục không thời hạn
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="radio"
                name="endSchedule"
                checked={Boolean(schedule.endTime)}
                onChange={() =>
                  updateSchedule({
                    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  })
                }
                className="h-3.5 w-3.5 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Đặt ngày giờ kết thúc (tối thiểu 24h)
            </label>
            {schedule.endTime && (
              <input
                type="datetime-local"
                value={toInputDatetime(schedule.endTime)}
                onChange={(e) => updateSchedule({ endTime: fromInputDatetime(e.target.value) })}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            )}
            <div className="text-[10px] text-slate-400">Múi giờ Việt Nam: UTC+7</div>
          </div>
        </div>
      </Field>

      {/* Cost & Duration Estimation Box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          Dự toán chi phí & Thời lượng chiến dịch
        </div>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-slate-500">Lịch trình:</div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {describeSchedule(schedule)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {costEstimate.isUnlimited
                ? 'Dự tính chi phí cho chu kỳ 30 ngày'
                : `Thời lượng dự kiến: ${costEstimate.days} ngày`}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Ước tính tổng chi tiêu:</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatVnd(costEstimate.totalVnd)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              ({formatVnd(totalBudget)} / ngày × {costEstimate.days} ngày)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

