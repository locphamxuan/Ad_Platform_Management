import { ForbiddenError } from './errors.js';
import { formatVnd } from './format.js';
import { ROLES, type Role, type Rule } from './types.js';

export const PERMISSIONS = [
  'report:view',
  'campaign:view',
  'campaign:manage',
  'rule:view',
  'rule:manage',
  'integration:view',
  'integration:manage',
  'activity:view',
  /** Set a campaign daily budget above the workspace's buyer limit */
  'budget:approve',
  'user:manage',
  /** Workspace governance: appoint or remove owners and admins */
  'workspace:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * What each level adds on top of the level below it, so the ladder is strictly nested:
 * Client reads reports → Media Buyer runs campaigns within a budget limit →
 * Admin runs the workspace (integrations, team, large budgets) → Owner governs it.
 */
const GRANTS_BY_LEVEL: Record<Role, readonly Permission[]> = {
  client: ['report:view'],
  media_buyer: ['campaign:view', 'campaign:manage', 'rule:view', 'rule:manage', 'integration:view', 'activity:view'],
  admin: ['integration:manage', 'budget:approve', 'user:manage'],
  owner: ['workspace:manage'],
};

/** A role's own grants plus everything granted to the levels below it. */
const inheritedGrants = (role: Role): readonly Permission[] =>
  ROLES.slice(ROLES.indexOf(role)).flatMap((level) => GRANTS_BY_LEVEL[level]);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: inheritedGrants('owner'),
  admin: inheritedGrants('admin'),
  media_buyer: inheritedGrants('media_buyer'),
  client: inheritedGrants('client'),
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị viên',
  media_buyer: 'Media Buyer',
  client: 'Khách hàng',
};

export const hasPermission = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission);

/**
 * The per-campaign daily budget cap that applies to a role, or null when it has none:
 * budget approvers are never capped, and the workspace may leave buyers uncapped too.
 */
export const dailyBudgetLimit = (role: Role, buyerLimit: number | null): number | null =>
  hasPermission(role, 'budget:approve') ? null : buyerLimit;

/** `limit` is the role's effective cap from dailyBudgetLimit. */
export function assertDailyBudgetAllowed(role: Role, limit: number | null, dailyBudget: number): void {
  if (limit !== null && dailyBudget > limit) {
    throw new ForbiddenError(
      `${ROLE_LABELS[role]} chỉ được đặt tối đa ${formatVnd(limit)}/ngày cho một chiến dịch; mức cao hơn cần Quản trị viên duyệt`,
    );
  }
}

/** Automated budget increases would bypass a per-campaign cap, so capped roles cannot enable or run them. */
export function assertRuleActionAllowed(role: Role, limit: number | null, action: Pick<Rule['action'], 'type'>): void {
  if (action.type === 'increase_budget' && limit !== null) {
    throw new ForbiddenError(`${ROLE_LABELS[role]} không thể bật hoặc chạy rule tự động tăng ngân sách`);
  }
}

/** Workspace governors manage everyone; other user managers only manage roles below their own. */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (!hasPermission(actorRole, 'user:manage')) return false;
  if (hasPermission(actorRole, 'workspace:manage')) return true;
  return ROLES.indexOf(targetRole) > ROLES.indexOf(actorRole);
}
