import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META, PLATFORMS, RULE_ACTION_LABELS, RULE_METRIC_LABELS } from '../../lib/constants';
import type { NewRule, RuleActionType, RuleMetric, RuleOperator } from '../../lib/types';

const INITIAL_RULE: NewRule = {
  name: '',
  enabled: true,
  platform: 'all',
  condition: { metric: 'cpa', operator: 'gt', threshold: 100_000, lookbackDays: 3 },
  action: { type: 'pause' },
};

const isBudgetAction = (type: RuleActionType) => type === 'increase_budget' || type === 'decrease_budget';

export function RuleForm({ onCreated }: { onCreated: () => void }) {
  const { can } = useAuth();
  // Automated increases bypass the per-campaign budget cap, so only budget approvers get them.
  const actionTypes = (Object.keys(RULE_ACTION_LABELS) as RuleActionType[]).filter(
    (type) => type !== 'increase_budget' || can('budget:approve'),
  );
  const [rule, setRule] = useState<NewRule>(INITIAL_RULE);
  const create = useMutation({
    mutationFn: api.rules.create,
    onSuccess: () => {
      setRule(INITIAL_RULE);
      onCreated();
    },
  });

  const setCondition = (changes: Partial<NewRule['condition']>) =>
    setRule((r) => ({ ...r, condition: { ...r.condition, ...changes } }));

  const setActionType = (type: RuleActionType) =>
    setRule((r) => ({ ...r, action: isBudgetAction(type) ? { type, value: r.action.value ?? 20 } : { type } }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(rule);
  };

  return (
    <form onSubmit={onSubmit} className="card-pad space-y-4 lg:sticky lg:top-10">
      <div>
        <p className="eyebrow">Rule mới</p>
        <h2 className="mt-1 section-title">Tạo quy tắc tự động</h2>
      </div>
      <Field label="Tên quy tắc">
        <input
          className="input"
          required
          minLength={3}
          maxLength={120}
          autoComplete="off"
          value={rule.name}
          onChange={(e) => setRule({ ...rule, name: e.target.value })}
          placeholder="VD: Dừng quảng cáo đốt tiền"
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

      <fieldset className="space-y-3 rounded-lg border border-line bg-canvas/60 p-4">
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
            {[1, 3, 7, 14].map((d) => (
              <option key={d} value={d}>
                trong {d} ngày
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-line bg-canvas/60 p-4">
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

      <button type="submit" className="btn-primary h-10 w-full" disabled={create.isPending}>
        {create.isPending ? 'Đang lưu…' : 'Lưu rule'}
      </button>
      <ErrorMessage error={create.error} />
    </form>
  );
}
