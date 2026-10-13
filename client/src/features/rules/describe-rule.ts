import { PLATFORM_META, RULE_ACTION_LABELS, RULE_METRIC_LABELS } from '../../lib/constants';
import { formatDecimal } from '../../lib/format';
import type { Rule } from '../../lib/types';

type RuleShape = Pick<Rule, 'platform' | 'condition' | 'action'>;

/** Human-readable IF/THEN parts of a rule, used on rule cards. */
export function describeRule(rule: RuleShape): { condition: string; action: string; scope: string } {
  const op = rule.condition.operator === 'gt' ? '>' : '<';
  return {
    // formatDecimal, not formatNumber: ROAS 1,5 and CTR 0,5 must not be rounded to whole numbers.
    condition: `${RULE_METRIC_LABELS[rule.condition.metric]} ${op} ${formatDecimal(rule.condition.threshold)} trong ${rule.condition.lookbackDays} ngày`,
    action: RULE_ACTION_LABELS[rule.action.type].replace('%', `${rule.action.value ?? ''}%`),
    scope: rule.platform === 'all' ? 'Mọi nền tảng' : PLATFORM_META[rule.platform].label,
  };
}

/** Default rule name when the user leaves it blank, e.g. "Tạm dừng chiến dịch khi CPA (đ) > 150.000 trong 3 ngày". */
export function suggestRuleName(rule: RuleShape): string {
  const { condition, action } = describeRule(rule);
  return `${action} khi ${condition}`.slice(0, 120);
}
