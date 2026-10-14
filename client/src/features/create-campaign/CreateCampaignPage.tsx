import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
} from '../../lib/draft-validation';
import { GoalStep } from './steps/GoalStep';
import { ContentStep } from './steps/ContentStep';
import { AudienceStep } from './steps/AudienceStep';
import { BudgetScheduleStep } from './steps/BudgetScheduleStep';
import { ReviewStep } from './steps/ReviewStep';
import { generateCreatives, parseBrief } from './brief';
import { suggestCampaign, TEMPLATES } from './autofill';

const STEPS = [
  { step: 1, title: 'Mục tiêu & Kênh' },
  { step: 2, title: 'Nội dung & Trang' },
  { step: 3, title: 'Đối tượng' },
  { step: 4, title: 'Ngân sách & Lịch' },
  { step: 5, title: 'Xác minh & Tạo' },
];

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
  },
  schedule: {},
  specialCategory: 'NONE',
  acknowledgeNationwide: false,
};

export function CreateCampaignPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const urlDraftId = searchParams.get('draft');
  const urlStep = Number(searchParams.get('step')) || 1;

  const [currentStep, setCurrentStep] = useState<number>(urlStep >= 1 && urlStep <= 5 ? urlStep : 1);
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [payload, setPayload] = useState<CampaignDraftPayload>(DEFAULT_PAYLOAD);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // AI Brief & Template autofill states
  const [briefInput, setBriefInput] = useState('');
  const [isAiBriefOpen, setIsAiBriefOpen] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(() => Math.floor(Math.random() * TEMPLATES.length));

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync step to URL
  const setStep = (step: number) => {
    setCurrentStep(step);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('step', String(step));
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
      if (urlStep) setCurrentStep(urlStep);
    }
  }, [draftQuery.data, urlStep]);

  // Autosave payload to server (debounce 1.5s) and localStorage
  const triggerAutosave = (newPayload: CampaignDraftPayload, stepNum = currentStep) => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (!draft) {
          // Create draft on server
          const created = await api.drafts.create({
            step: stepNum,
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
          // Update existing draft
          const updated = await api.drafts.update(draft.id, {
            revision: draft.revision,
            step: stepNum,
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
      triggerAutosave(next, currentStep);
      return next;
    });
    setStepErrors({});
  };

  // AI Brief Quick Fill
  const handleApplyBrief = () => {
    if (!briefInput.trim()) return;
    const brief = parseBrief(briefInput);
    const variants = generateCreatives(brief);
    const variant = variants[0];
    const newPayload: CampaignDraftPayload = {
      ...payload,
      name: `${brief.product} ${new Date().toLocaleDateString('vi-VN')}`,
      objective: brief.objective,
      totalDailyBudget: brief.totalDailyBudget ?? payload.totalDailyBudget,
      creative: {
        headline: variant ? variant.headline : payload.creative.headline,
        primaryText: variant ? variant.primaryText : payload.creative.primaryText,
        landingUrl: brief.landingUrl ?? payload.creative.landingUrl,
        cta: payload.creative.cta ?? 'LEARN_MORE',
      },
    };
    updatePayload(newPayload);
    setIsAiBriefOpen(false);
    setBriefInput('');
  };

  // Autofill Template
  const handleAutofillTemplate = () => {
    const suggested = suggestCampaign({
      index: templateIndex,
      now: new Date(),
      platforms: payload.platforms,
      minBudget: new Map(),
      limit: null,
    });
    setTemplateIndex((prev) => (prev + 1) % TEMPLATES.length);
    const newPayload: CampaignDraftPayload = {
      ...payload,
      name: suggested.name,
      objective: suggested.objective,
      totalDailyBudget: suggested.totalDailyBudget,
      creative: {
        headline: suggested.creative.headline,
        primaryText: suggested.creative.primaryText,
        landingUrl: suggested.creative.landingUrl,
        cta: payload.creative.cta ?? 'LEARN_MORE',
      },
    };
    updatePayload(newPayload);
  };

  // Step Navigation & Validation
  const handleNext = () => {
    let result = { valid: true, errors: {} as Record<string, string> };
    if (currentStep === 1) result = validateStep1(payload);
    else if (currentStep === 2) result = validateStep2(payload);
    else if (currentStep === 3) result = validateStep3(payload);
    else if (currentStep === 4) result = validateStep4(payload);

    if (!result.valid) {
      setStepErrors(result.errors);
      return;
    }

    setStepErrors({});
    if (currentStep < 5) {
      setStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setStepErrors({});
      setStep(currentStep - 1);
    }
  };

  const handleSubmitted = (campaign: Campaign) => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-drafts'] });
    navigate(`/campaigns/${campaign.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Tạo chiến dịch mới"
          description="Quy trình 5 bước thiết lập chiến dịch Dark Post an toàn, tự động xác minh trước khi gửi lên Meta."
        />

        {/* Save Status Banner */}
        <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:self-auto">
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
              <span>Bản nháp tự động lưu</span>
            </>
          )}
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-[600px] items-center justify-between">
          {STEPS.map((s, index) => {
            const isPassed = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <div key={s.step} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => setStep(s.step)}
                  className="flex items-center gap-2.5 text-left focus:outline-none"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isPassed
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950/60'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {isPassed ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      s.step
                    )}
                  </div>
                  <div>
                    <div
                      className={`text-xs font-semibold ${
                        isCurrent
                          ? 'text-blue-600 dark:text-blue-400'
                          : isPassed
                            ? 'text-slate-800 dark:text-slate-200'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      Bước {s.step}
                    </div>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {s.title}
                    </div>
                  </div>
                </button>

                {index < STEPS.length - 1 && (
                  <div
                    className={`mx-4 h-0.5 flex-1 transition-colors ${
                      isPassed ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Brief & Autofill Assistant (Available at Step 1) */}
      {currentStep === 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50/50 to-pink-50/40 p-4 dark:border-purple-900/40 dark:from-purple-950/20 dark:to-pink-950/20">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-xs font-bold text-white shadow-sm">
              ✨
            </span>
            <div>
              <div className="text-sm font-semibold text-purple-950 dark:text-purple-200">
                Trợ lý tạo nhanh bằng AI Brief & Mẫu có sẵn
              </div>
              <div className="text-xs text-purple-700/80 dark:text-purple-300/80">
                Nhập 1 dòng mô tả ý tưởng hoặc chọn mẫu để tự động điền toàn bộ cấu hình.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAiBriefOpen((v) => !v)}
              className="rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm hover:bg-purple-50 dark:border-purple-800 dark:bg-slate-900 dark:text-purple-300"
            >
              {isAiBriefOpen ? 'Đóng AI Brief' : 'Nhập AI Brief 🪄'}
            </button>
            <button
              type="button"
              onClick={handleAutofillTemplate}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
            >
              Mẫu ngẫu nhiên 🎲
            </button>
          </div>

          {isAiBriefOpen && (
            <div className="mt-3 w-full rounded-lg bg-white p-3 shadow-inner dark:bg-slate-900">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={briefInput}
                  onChange={(e) => setBriefInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyBrief()}
                  placeholder="Ví dụ: Giảm 20% căn hộ nghỉ dưỡng Phú Quốc, ngân sách 2 triệu/ngày, link https://phuquoc.vn"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleApplyBrief}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Step Form Body */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {currentStep === 1 && (
          <GoalStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
          />
        )}

        {currentStep === 2 && (
          <ContentStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
          />
        )}

        {currentStep === 3 && (
          <AudienceStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
          />
        )}

        {currentStep === 4 && (
          <BudgetScheduleStep
            payload={payload}
            onChange={updatePayload}
            errors={stepErrors}
            dailyBudgetLimit={user?.dailyBudgetLimit}
          />
        )}

        {currentStep === 5 && (
          <ReviewStep
            draft={draft ?? {
              id: 'temp',
              ownerId: user?.id ?? '',
              revision: 1,
              state: 'DRAFT',
              step: 5,
              payload,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            onSubmitted={handleSubmitted}
            onBackToStep={(s) => setStep(s)}
          />
        )}

        {/* Wizard Footer Navigation */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-800">
          <button
            type="button"
            disabled={currentStep === 1}
            onClick={handleBack}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            ← Quay lại
          </button>

          {currentStep < 5 && (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Tiếp tục →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
