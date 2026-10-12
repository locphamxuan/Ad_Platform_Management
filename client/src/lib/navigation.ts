import type { Permission } from './types';

/** Sidebar entries; each is shown only to roles holding its permission. */
export const NAV_ITEMS: { to: string; label: string; permission: Permission }[] = [
  { to: '/', label: 'Tổng quan', permission: 'report:view' },
  { to: '/campaigns', label: 'Chiến dịch', permission: 'campaign:view' },
  { to: '/campaigns/new', label: 'Tạo chiến dịch', permission: 'campaign:manage' },
  { to: '/rules', label: 'Tự động hoá', permission: 'rule:view' },
  { to: '/integrations', label: 'Kết nối nền tảng', permission: 'integration:view' },
  { to: '/activity', label: 'Nhật ký', permission: 'activity:view' },
  { to: '/users', label: 'Người dùng', permission: 'user:manage' },
];
