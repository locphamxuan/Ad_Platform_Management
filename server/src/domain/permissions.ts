import { ROLES, type Role } from './types.js';

export const PERMISSIONS = [
  'report:view',
  'campaign:view',
  'campaign:manage',
  'rule:view',
  'rule:manage',
  'integration:view',
  'integration:manage',
  'activity:view',
  'user:manage',
  /** Workspace governance: manage owners/admins and see team-wide budget overview */
  'workspace:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  'report:view',
  'campaign:view',
  'rule:view',
  'integration:view',
  'activity:view',
];

/**
 * Owner governs the workspace, Admin runs day-to-day operations (integrations, team below admin),
 * Media Buyer operates campaigns and rules, Viewer reads everything, Client only sees reports.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'workspace:manage'),
  media_buyer: [...READ_ONLY, 'campaign:manage', 'rule:manage'],
  viewer: READ_ONLY,
  client: ['report:view'],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị viên',
  media_buyer: 'Media Buyer',
  viewer: 'Người xem',
  client: 'Khách hàng',
};

export const hasPermission = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission);

/** Workspace governors manage everyone; other user managers only manage roles below their own. */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (!hasPermission(actorRole, 'user:manage')) return false;
  if (hasPermission(actorRole, 'workspace:manage')) return true;
  return ROLES.indexOf(targetRole) > ROLES.indexOf(actorRole);
}
