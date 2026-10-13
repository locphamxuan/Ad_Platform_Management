import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Icon } from '../../components/icons';
import { AiBadge, ErrorMessage, Field, PlatformTag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META, PLATFORMS, RULE_ACTION_LABELS, RULE_METRIC_LABELS } from '../../lib/constants';
import { lastNDays } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { NewRule, RuleActionType, RuleMetric, RuleOperator } from '../../lib/types';
import { useTextParam } from '../../lib/url-state';
import { describeRule, suggestRuleName } from './describe-rule';
import { LOOKBACK_OPTIONS, parseRule, type RuleDraft } from './parse-rule';
import { matchingCampaigns, suggestRules } from './simulate-rule';

const INITIAL_RULE: NewRule = {
  name: '',
  enabled: true,
  platform: 'all',
  condition: { metric: 'cpa', operator: 'gt', threshold: 100_000, lookbackDays: 3 },
  action: { type: 'pause' },
};

const isBudgetAction = (type: RuleActionType) => type === 'increase_budget' || type === 'decrease_budget';

export function RuleForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  // Automated increases would bypass a per-campaign budget cap, so capped users don't get them.
  const capped = user?.dailyBudgetLimit != null;
  const actionTypes = (Object.keys(RULE_ACTION_LABELS) as RuleActionType[]).filter(
    (type) => type !== 'increase_budget' || !capped,
  );
  const [draftParam, setDraftParam] = useTextParam('draft');
  const [sentence, setSentence] = useState(draftParam);
  // A sentence handed over from the assistant box (?draft=…) is read straight away.
  const [initial] = useState(() => (draftParam ? fromSentence(draftParam, capped) : null));
  const [understood, setUnderstood] = useState<{ missing: string[]; blocked: boolean } | null>(initial);
  const [rule, setRule] = useState<NewRule>(initial?.rule ?? INITIAL_RULE);
  const suggestedName = suggestRuleName(rule);

  const lookback = lastNDays(rule.condition.lookbackDays);
  const campaigns = useQuery({ queryKey: queryKeys.campaigns(lookback), queryFn: () => api.campaigns.list(lookback) });
  const weekRange = lastNDays(7);
  const recent = useQuery({ queryKey: queryKeys.campaigns(weekRange), queryFn: () => api.campaigns.list(weekRange) });
  const suggestions = suggestRules(recent.data ?? [], !capped);
  const matches = campaigns.data ? matchingCampaigns(rule, campaigns.data) : [];

  const create = useMutation({
    mutationFn: api.rules.create,
    onSuccess: () => {
      setRule(INITIAL_RULE);
      setSentence('');
      setUnderstood(null);
      setDraftParam('');
      onCreated();
    },
  });

  const setCondition = (changes: Partial<NewRule['condition']>) =>
    setRule((r) => ({ ...r, condition: { ...r.condition, ...changes } }));

  const setActionType = (type: RuleActionType) =>
    setRule((r) => ({ ...r, action: isBudgetAction(type) ? { type, value: r.action.value ?? 20 } : { type } }));

  const applyDraft = (draft: RuleDraft) => setRule({ ...draft, name: '', enabled: true });

  const understand = () => {
    if (!sentence.trim()) return;
    const parsed = fromSentence(sentence, capped);
    setRule(parsed.rule);
    setUnderstood({ missing: parsed.missing, blocked: parsed.blocked });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ ...rule, name: rule.name.trim() || suggestedName });
  };

  const { condition, action } = describeRule(rule);
  const affectsLabel = rule.action.type === 'activate' ? 'đang tạm dừng' : 'đang chạy';

  return (
    <form onSubmit={onSubmit} className="space-y-4 lg:sticky lg:top-24">
      <section className="card-ai space-y-3 p-5">
        <div className="flex items-center gap-2">
          <h2 className="section-title">Mô tả quy tắc bằng lời</h2>
          <AiBadge label="Hiểu tiếng Việt" />
        </div>
        <textarea
          className="input"
          rows={2}
          aria-label="Mô tả quy tắc"
          placeholder="VD: Tạm dừng khi CPA > 150k trong 3 ngày trên Facebook"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              understand();
            }
          }}
        />
        <button type="button" className="btn-ai btn-sm w-full" disabled={!sentence.trim()} onClick={understand}>
          <Icon name="sparkles" size={14} />
          Chuyển thành quy tắc
        </button>
        {understood && (
          <div role="status" className="rounded-xl bg-spark-soft px-3 py-2 text-xs text-ink-soft">
            <p>
              <span className="font-semibold">Đã hiểu:</span> Nếu {condition} → {action}.
            </p>
            {understood.missing.length > 0 && (
              <p className="mt-1 text-muted">Không thấy {understood.missing.join(', ')} trong câu — đã dùng giá trị mặc định, sửa bên dưới nếu cần.</p>
            )}
            {understood.blocked && <p className="mt-1 text-caution">Tăng ngân sách tự động cần Chủ sở hữu; đã đổi thành tạm dừng.</p>}
          </div>
        )}
      </section>

      <section className="card-pad space-y-4">
        <div>
          <p className="eyebrow">Rule mới</p>
          <h2 className="mt-1 section-title">Tạo quy tắc tự động</h2>
        </div>
        <div>
          <p className="label flex items-center gap-2">
            Gợi ý theo dữ liệu của bạn <Icon name="lightbulb" size={14} className="text-spark" />
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.label} type="button" className="btn-secondary btn-sm" title={s.why} onClick={() => applyDraft(s.rule)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Tên quy tắc" hint="Để trống sẽ tự đặt tên theo điều kiện và hành động">
          <input
            className="input"
            minLength={3}
            maxLength={120}
            autoComplete="off"
            value={rule.name}
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
            placeholder={suggestedName}
          />
        </Field>
        <Field label="Áp dụng cho">
          <select
            className="input"
            value={rule.platform}
            onChange={(e) => setRule({ ...rule, platform: e.target.value as NewRule['platform'] })}
          >
            <option value="all">Mọi nền tảng</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_META[p].label}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="space-y-3 rounded-xl border border-line bg-ink/[0.02] p-4">
          <legend className="eyebrow px-1">Nếu</legend>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Chỉ số"
              className="input"
              value={rule.condition.metric}
              onChange={(e) => setCondition({ metric: e.target.value as RuleMetric })}
            >
              {Object.entries(RULE_METRIC_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              aria-label="Phép so sánh"
              className="input"
              value={rule.condition.operator}
              onChange={(e) => setCondition({ operator: e.target.value as RuleOperator })}
            >
              <option value="gt">lớn hơn</option>
              <option value="lt">nhỏ hơn</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              aria-label="Ngưỡng"
              className="input tabular-nums"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              required
              value={rule.condition.threshold}
              onChange={(e) => setCondition({ threshold: Number(e.target.value) })}
            />
            <select
              aria-label="Khoảng thời gian"
              className="input"
              value={rule.condition.lookbackDays}
              onChange={(e) => setCondition({ lookbackDays: Number(e.target.value) })}
            >
              {LOOKBACK_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  trong {d} ngày
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line bg-ink/[0.02] p-4">
          <legend className="eyebrow px-1">Thì</legend>
          <select
            aria-label="Hành động"
            className="input"
            value={rule.action.type}
            onChange={(e) => setActionType(e.target.value as RuleActionType)}
          >
            {actionTypes.map((type) => (
              <option key={type} value={type}>
                {RULE_ACTION_LABELS[type]}
              </option>
            ))}
          </select>
          {isBudgetAction(rule.action.type) && (
            <Field label="Mức thay đổi (%)" hint="Tối đa 50% mỗi lần chạy">
              <input
                className="input tabular-nums"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                required
                value={rule.action.value}
                onChange={(e) => setRule({ ...rule, action: { ...rule.action, value: Number(e.target.value) } })}
              />
            </Field>
          )}
        </fieldset>

        <div className="rounded-xl border border-dashed border-accent/40 bg-accent-soft/50 p-4" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="eye" size={15} className="text-accent" />
            Mô phỏng trước khi lưu
          </p>
          {campaigns.isLoading ? (
            <p className="mt-1 text-xs text-muted">Đang tính…</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                Nếu chạy ngay, rule tác động{' '}
                <span className="font-semibold tabular-nums text-ink">{matches.length}</span> chiến dịch {affectsLabel} (số liệu{' '}
                {rule.condition.lookbackDays} ngày qua).
              </p>
              {matches.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {matches.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-xs">
                      <PlatformTag platform={c.platform} compact />
                      <span className="truncate">{c.name}</span>
                    </li>
                  ))}
                  {matches.length > 4 && <li className="text-xs text-muted">và {matches.length - 4} chiến dịch khác</li>}
                </ul>
              )}
            </>
          )}
        </div>

        <button type="submit" className="btn-primary h-10 w-full" disabled={create.isPending}>
          {create.isPending ? 'Đang lưu…' : 'Lưu và bật rule'}
        </button>
        <ErrorMessage error={create.error} />
      </section>
    </form>
  );
}

/** A parsed sentence as a full rule; a budget increase becomes a pause for capped users. */
function fromSentence(sentence: string, capped: boolean): { rule: NewRule; missing: string[]; blocked: boolean } {
  const parsed = parseRule(sentence);
  const blocked = capped && parsed.rule.action.type === 'increase_budget';
  const draft: RuleDraft = blocked ? { ...parsed.rule, action: { type: 'pause' } } : parsed.rule;
  return { rule: { ...draft, name: '', enabled: true }, missing: parsed.missing, blocked };
}
