import type { IconName } from '../components/icons';
import type { Permission } from './types';

/** Sidebar entries; each is shown only to roles holding its permission. */
export const NAV_ITEMS: { to: string; label: string; permission: Permission; icon: IconName }[] = [
  { to: '/', label: 'Tổng quan', permission: 'report:view', icon: 'dashboard' },
  { to: '/campaigns', label: 'Chiến dịch', permission: 'campaign:view', icon: 'megaphone' },
  { to: '/campaigns/new', label: 'Tạo chiến dịch', permission: 'campaign:manage', icon: 'wand' },
  { to: '/rules', label: 'Tự động hoá', permission: 'rule:view', icon: 'zap' },
  { to: '/integrations', label: 'Kết nối nền tảng', permission: 'integration:view', icon: 'plug' },
  { to: '/activity', label: 'Nhật ký', permission: 'activity:view', icon: 'history' },
  { to: '/users', label: 'Người dùng', permission: 'user:manage', icon: 'users' },
];
