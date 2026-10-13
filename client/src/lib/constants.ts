import type { Objective, Platform, Role, RuleActionType, RuleMetric } from './types';

export const PLATFORMS: Platform[] = ['facebook', 'tiktok', 'google'];

export const PLATFORM_META: Record<Platform, { label: string; color: string }> = {
  facebook: { label: 'Facebook', color: '#1877F2' },
  tiktok: { label: 'TikTok', color: '#E2165A' },
  google: { label: 'Google Ads', color: '#1E8E3E' },
};

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  awareness: 'Nhận diện thương hiệu',
  traffic: 'Lưu lượng truy cập',
  leads: 'Thu thập khách tiềm năng',
  sales: 'Doanh số / Chuyển đổi',
};

export const RULE_METRIC_LABELS: Record<RuleMetric, string> = {
  cpa: 'CPA (đ)',
  roas: 'ROAS (x)',
  spend: 'Chi tiêu (đ)',
  ctr: 'CTR (%)',
};

export const RULE_ACTION_LABELS: Record<RuleActionType, string> = {
  pause: 'Tạm dừng chiến dịch',
  activate: 'Bật lại chiến dịch',
  increase_budget: 'Tăng ngân sách %',
  decrease_budget: 'Giảm ngân sách %',
};

/** From most to least privileged; each level includes everything below it. */
export const ROLES: Role[] = ['owner', 'admin', 'media_buyer', 'client'];

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  owner: {
    label: 'Chủ sở hữu',
    description: 'Toàn quyền như Quản trị viên, thêm quyền bổ nhiệm Chủ sở hữu/Quản trị viên và đặt hạn mức ngân sách',
  },
  admin: {
    label: 'Quản trị viên',
    description: 'Kết nối nền tảng, quản lý Media Buyer và Khách hàng, duyệt ngân sách vượt hạn mức và rule tăng ngân sách',
  },
  media_buyer: {
    label: 'Media Buyer',
    description: 'Vận hành chiến dịch và rule, trong hạn mức ngân sách do Chủ sở hữu đặt (mặc định không giới hạn)',
  },
  client: { label: 'Khách hàng', description: 'Chỉ xem báo cáo hiệu quả quảng cáo' },
};

/**
 * Budget inputs move in whole thousands of dong. `min` must equal the step: browsers only accept
 * min + n × step, so min=1 with step=1000 rejected round amounts such as 1.000.000.
 */
export const BUDGET_STEP = 1000;

/** Day counts as strings because they round-trip through the URL. */
export const DATE_RANGE_OPTIONS = ['7', '14', '30'] as const;
export type DateRangeDays = (typeof DATE_RANGE_OPTIONS)[number];
