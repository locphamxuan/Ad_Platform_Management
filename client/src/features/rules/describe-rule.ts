import { PLATFORM_META, RULE_ACTION_LABELS, RULE_METRIC_LABELS } from '../../lib/constants';
import { formatNumber } from '../../lib/format';
import type { Rule } from '../../lib/types';

/** Human-readable IF/THEN parts of a rule, used on rule cards. */
export function describeRule(rule: Rule): { condition: string; action: string; scope: string } {
  const op = rule.condition.operator === 'gt' ? '>' : '<';
  return {
    condition: `${RULE_METRIC_LABELS[rule.condition.metric]} ${op} ${formatNumber(rule.condition.threshold)} trong ${rule.condition.lookbackDays} ngày`,
    action: RULE_ACTION_LABELS[rule.action.type].replace('%', `${rule.action.value ?? ''}%`),
    scope: rule.platform === 'all' ? 'Mọi nền tảng' : PLATFORM_META[rule.platform].label,
  };
}
