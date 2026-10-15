import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Campaign, CampaignDraft, CampaignDraftPayload } from '../../lib/types';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateAbStep,
  validateAdvancedStep,
} from '../../lib/draft-validation';
import { GoalStep } from './steps/GoalStep';
import { ContentStep } from './steps/ContentStep';
import { AudienceStep } from './steps/AudienceStep';
import { BudgetScheduleStep } from './steps/BudgetScheduleStep';
import { AbStudioStep } from './steps/AbStudioStep';
import { AdvancedStudioStep } from './steps/AdvancedStudioStep';
import { ReviewStep } from './steps/ReviewStep';

type StepId = 'goal' | 'content' | 'audience' | 'budget' | 'ab' | 'advanced' | 'review';

const DEFAULT_PAYLOAD: CampaignDraftPayload = {
  name: '',
  objective: 'traffic',
  platforms: ['facebook'],
  totalDailyBudget: 500_000,
  allocations: [{ platform: 'facebook', percentage: 100 }],
  creative: {
    headline: '',
    primaryText: '',
    landingUrl: 'https://',
    cta: 'LEARN_MORE',
  },
  pages: [],
  audience: {
    locations: 'VN',
    ageMin: 18,
    ageMax: 65,
    genders: ['MALE', 'FEMALE'],
    detailedTargeting: [],
    advantageExpansion: true,
  },
  schedule: {},
  specialCategory: 'NONE',
  acknowledgeNationwide: false,
  buying_type: 'AUCTION',
  setup_mode: 'recommended',
  placements: { mode: 'preset', list: [] },
  advanced: {
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  },
  ab_plan: {
    enabled: false,
    variable: 'content',
    splitRatio: 50,
    metric: 'cpa',
    variants: [],
  },
};

export function CreateCampaignPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const urlDraftId = searchParams.get('draft');
  const urlStep = Number(searchParams.get('step')) || 1;
  const urlMode = searchParams.get('mode');

  // Mode state: Simple vs Expert
  const [expertMode, setExpertMode] = useState<boolean>(() => {
    if (urlMode === 'expert') return true;
    if (urlMode === 'simple') return false;
    return localStorage.getItem('adhub_creator_mode') === 'expert';
  });

  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [payload, setPayload] = useState<CampaignDraftPayload>(DEFAULT_PAYLOAD);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Dynamic steps calculation
  const isAbEnabled = Boolean(payload.ab_plan?.enabled);
  const activeSteps = useMemo(() => {
    const list: Array<{ id: StepId; title: string; subtitle: string }> = [
      { id: 'goal', title: 'Mục tiêu & Kênh', subtitle: 'Mục tiêu & Nền tảng' },
      { id: 'content', title: 'Nội dung & Trang', subtitle: 'Trang & Mẫu Dark Post' },
      { id: 'audience', title: 'Đối tượng', subtitle: 'Khu vực & Độ tuổi' },
      { id: 'budget', title: 'Ngân sách & Lịch', subtitle: 'Chi phí & Lịch chạy' },
    ];

    if (isAbEnabled) {
      list.push({ id: 'ab', title: 'Thử nghiệm A/B', subtitle: 'Thiết kế phương án A/B' });
    }

    if (expertMode || payload.setup_mode === 'manual') {
      list.push({ id: 'advanced', title: 'Cài đặt nâng cao', subtitle: 'Vị trí & Giá thầu Meta' });
    }

    list.push({ id: 'review', title: 'Xác minh & Tạo', subtitle: 'Kiểm tra & Gửi duyệt' });
    return list;
  }, [isAbEnabled, expertMode, payload.setup_mode]);

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(() => {
    const stepNum = urlStep >= 1 ? urlStep - 1 : 0;
    return Math.min(stepNum, activeSteps.length - 1);
  });

  // Ensure current step index is within bounds when steps list changes
  useEffect(() => {
    if (currentStepIndex >= activeSteps.length) {
      setCurrentStepIndex(activeSteps.length - 1);
    }
  }, [activeSteps.length, currentStepIndex]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync step to URL
  const setStepNumber = (stepNum: number) => {
    const nextIdx = Math.max(0, Math.min(stepNum - 1, activeSteps.length - 1));
    setCurrentStepIndex(nextIdx);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('step', String(nextIdx + 1));
      return next;
    });
  };

  const handleToggleMode = (isExpert: boolean) => {
    setExpertMode(isExpert);
    localStorage.setItem('adhub_creator_mode', isExpert ? 'expert' : 'simple');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mode', isExpert ? 'expert' : 'simple');
      return next;
    });
  };

  // Load existing draft if ID in URL
  const draftQuery = useQuery({
    queryKey: ['campaign-drafts', urlDraftId],
    queryFn: () => (urlDraftId ? api.drafts.get(urlDraftId) : null),
    enabled: Boolean(urlDraftId),
  });

  useEffect(() => {
    if (draftQuery.data) {
      setDraft(draftQuery.data);
      setPayload(draftQuery.data.payload);
      if (urlStep) {
        setCurrentStepIndex(Math.max(0, Math.min(urlStep - 1, activeSteps.length - 1)));
      }
    }
  }, [draftQuery.data, urlStep, activeSteps.length]);

  // Autosave payload to server (debounce 1.5s) and localStorage
  const triggerAutosave = (newPayload: CampaignDraftPayload, stepNum = currentStepIndex + 1) => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (!draft) {
          const created = await api.drafts.create({
            step: Math.min(stepNum, 7),
            payload: newPayload,
          });
          setDraft(created);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('draft', created.id);
            next.set('step', String(stepNum));
            return next;
          });
          localStorage.setItem(`adhub_draft_${created.id}`, JSON.stringify(newPayload));
        } else {
          const updated = await api.drafts.update(draft.id, {
            revision: draft.revision,
            step: Math.min(stepNum, 7),
            payload: newPayload,
          });
          setDraft(updated);
          localStorage.setItem(`adhub_draft_${draft.id}`, JSON.stringify(newPayload));
        }
        setSaveStatus('saved');
        const now = new Date();
        setLastSavedAt(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.error('Autosave error:', err);
        setSaveStatus('error');
      }
    }, 1500);
  };

  const updatePayload = (patch: Partial<CampaignDraftPayload>) => {
    setPayload((prev) => {
      const next = { ...prev, ...patch };
      triggerAutosave(next, currentStepIndex + 1);
      return next;
    });
    setStepErrors({});
  };

  // Step Navigation & Validation
  const currentStepItem = activeSteps[currentStepIndex] || activeSteps[0];
  const currentStepId = currentStepItem.id;

  const handleNext = () => {
    let result = { valid: true, errors: {} as Record<string, string> };

    if (currentStepId === 'goal') result = validateStep1(payload);
    else if (currentStepId === 'content') result = validateStep2(payload);
    else if (currentStepId === 'audience') result = validateStep3(payload);
    else if (currentStepId === 'budget') result = validateStep4(payload);
    else if (currentStepId === 'ab') result = validateAbStep(payload);
    else if (currentStepId === 'advanced') result = validateAdvancedStep(payload);

    if (!result.valid) {
      setStepErrors(result.errors);
      return;
    }

    setStepErrors({});
    if (currentStepIndex < activeSteps.length - 1) {
      setStepNumber(currentStepIndex + 2);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setStepErrors({});
      setStepNumber(currentStepIndex);
    }
  };

  const handleSubmitted = (campaign: Campaign) => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-drafts'] });
    navigate(`/campaigns/${campaign.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Mode Toggle Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Tạo quảng cáo nhanh"
          description={
            expertMode
              ? 'Chế độ chuyên gia: Mở khóa cấu hình kỹ thuật Meta Graph API, Placements, Bidding, Dayparting và Thử nghiệm A/B.'
              : 'Quy trình đơn giản: Thiết lập chiến dịch Dark Post an toàn, tự động xác minh trước khi gửi lên Meta.'
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher: Chế độ đơn giản vs Chế độ chuyên gia */}
          <div
            className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-testid="mode-toggle"
          >
            <button
              type="button"
              onClick={() => handleToggleMode(false)}
              data-testid="mode-simple"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                !expertMode
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Chế độ đơn giản
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode(true)}
              data-testid="mode-expert"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                expertMode
                  ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-400 dark:bg-amber-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <span>Chế độ chuyên gia</span>
              <span className="rounded bg-white/20 px-1 text-[10px]">PRO</span>
            </button>
          </div>

          {/* Autosave Status Badge */}
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {saveStatus === 'saving' && (
              <>
                <span className="h-2 w-2 animate-ping rounded-full bg-blue-500" />
                <span>Đang lưu bản nháp...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Đã lưu lúc {lastSavedAt}</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Lưu cục bộ (Ngoại tuyến)</span>
              </>
            )}
            {saveStatus === 'idle' && (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span>Tự động lưu bản nháp</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stepper Navigation Bar */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-[650px] items-center justify-between">
          {activeSteps.map((s, index) => {
            const isPassed = currentStepIndex > index;
            const isCurrent = currentStepIndex === index;
            return (
              <div key={s.id} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => setStepNumber(index + 1)}
                  className="flex items-center gap-2.5 text-left focus:outline-none"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isPassed
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? expertMode
                            ? 'bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-950/60'
                            : 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950/60'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {isPassed ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div>
                    <div
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        isCurrent
                          ? expertMode
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-blue-600 dark:text-blue-400'
                          : isPassed
                            ? 'text-slate-700 dark:text-slate-300'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      Bước {index + 1}
                    </div>
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {s.title}
                    </div>
                  </div>
                </button>

                {index < activeSteps.length - 1 && (
                  <div
                    className={`mx-3 h-0.5 flex-1 transition-colors ${
                      isPassed ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Step Body */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {currentStepId === 'goal' && (
          <GoalStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
            expertMode={expertMode}
          />
        )}

        {currentStepId === 'content' && (
          <ContentStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
            expertMode={expertMode}
          />
        )}

        {currentStepId === 'audience' && (
          <AudienceStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
            expertMode={expertMode}
          />
        )}

        {currentStepId === 'budget' && (
          <BudgetScheduleStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
            dailyBudgetLimit={user?.dailyBudgetLimit}
            expertMode={expertMode}
          />
        )}

        {currentStepId === 'ab' && (
          <AbStudioStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
          />
        )}

        {currentStepId === 'advanced' && (
          <AdvancedStudioStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
          />
        )}

        {currentStepId === 'review' && (
          <ReviewStep
            draft={
              draft ?? {
                id: 'temp',
                ownerId: user?.id ?? '',
                revision: 1,
                state: 'DRAFT',
                step: currentStepIndex + 1,
                payload,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            }
            onSubmitted={handleSubmitted}
            onBackToStep={(s) => setStepNumber(s)}
            expertMode={expertMode}
          />
        )}

        {/* Wizard Footer Navigation */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-800">
          <button
            type="button"
            disabled={currentStepIndex === 0}
            onClick={handleBack}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            ← Quay lại
          </button>

          {currentStepIndex < activeSteps.length - 1 && (
            <button
              type="button"
              onClick={handleNext}
              className={`rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
                expertMode
                  ? 'bg-amber-500 hover:bg-amber-600 ring-1 ring-amber-400'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Tiếp tục →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
