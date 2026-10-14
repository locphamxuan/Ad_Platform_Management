import { allocateBudget, splitEvenly } from '../../lib/budget';
import type { CreateUnifiedCampaignInput, Objective, Platform } from '../../lib/types';

export type CampaignDraft = Pick<
  CreateUnifiedCampaignInput,
  'name' | 'objective' | 'totalDailyBudget' | 'creative'
>;

interface Template {
  objective: Objective;
  name: string;
  slug: string;
  headline: string;
  primaryText: string;
  path: string;
}

/** Common Vietnamese campaign shapes, one per objective and a second sales one; `{month}` becomes "10/2026". */
export const TEMPLATES: readonly Template[] = [
  {
    objective: 'sales',
    name: 'Flash Sale cuối tuần',
    slug: 'flash-sale',
    headline: 'Flash Sale – Giảm đến 50% chỉ 48 giờ',
    primaryText:
      'Săn deal cuối tuần: hàng trăm sản phẩm giảm đến 50%, miễn phí giao hàng cho đơn từ 299.000đ. Số lượng có hạn, đặt ngay hôm nay!',
    path: '/khuyen-mai',
  },
  {
    objective: 'traffic',
    name: 'Ra mắt bộ sưu tập mới {month}',
    slug: 'bst-moi',
    headline: 'Bộ sưu tập mới đã lên kệ',
    primaryText:
      'Khám phá những mẫu mới nhất tháng {month}: thiết kế tinh gọn, chất liệu bền đẹp, giá chỉ từ 199.000đ.',
    path: '/san-pham-moi',
  },
  {
    objective: 'leads',
    name: 'Đăng ký tư vấn miễn phí {month}',
    slug: 'tu-van',
    headline: 'Nhận tư vấn miễn phí trong 24 giờ',
    primaryText:
      'Để lại số điện thoại, chuyên viên của chúng tôi sẽ gọi lại trong 24 giờ để tư vấn giải pháp phù hợp nhất cho bạn. Hoàn toàn miễn phí.',
    path: '/dang-ky-tu-van',
  },
  {
    objective: 'awareness',
    name: 'Nhận diện thương hiệu {month}',
    slug: 'thuong-hieu',
    headline: 'Chất lượng bạn tin, giá trị bạn xứng đáng',
    primaryText:
      'Hơn 10.000 khách hàng đã tin chọn. Cùng chúng tôi mang đến trải nghiệm mua sắm an tâm mỗi ngày.',
    path: '/gioi-thieu',
  },
  {
    objective: 'sales',
    name: 'Mua 1 tặng 1 {month}',
    slug: 'mua-1-tang-1',
    headline: 'Mua 1 tặng 1 – Chỉ trong tuần này',
    primaryText:
      'Mua bất kỳ sản phẩm nào trong danh mục ưu đãi, nhận ngay 1 sản phẩm cùng loại miễn phí. Áp dụng đến hết Chủ nhật.',
    path: '/mua-1-tang-1',
  },
];

const LANDING_SITE = 'https://bahagroup.vn';
const TOTAL_BUDGETS = [1_000_000, 2_000_000, 3_000_000, 5_000_000, 500_000];
const pad = (n: number) => String(n).padStart(2, '0');

interface SuggestOptions {
  /** Which template to use; wraps around, so callers can simply count clicks. */
  index: number;
  now: Date;
  platforms: readonly Platform[];
  /** Minimum daily budget per platform from the integrations */
  minBudget: ReadonlyMap<Platform, number>;
  /** The user's per-campaign cap; null = uncapped */
  limit: number | null;
}

/** A complete, valid campaign ready to submit: every channel gets at least its minimum and stays within the cap. */
export function suggestCampaign({
  index,
  now,
  platforms,
  minBudget,
  limit,
}: SuggestOptions): CampaignDraft {
  const template = TEMPLATES[((index % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length];
  const month = `${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const fill = (text: string) => text.replaceAll('{month}', month);
  const day = `${pad(now.getDate())}${pad(now.getMonth() + 1)}`;
  // Names without a month get the date so repeated autofills stay distinguishable.
  const name = template.name.includes('{month}')
    ? fill(template.name)
    : `${template.name} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`;
  return {
    name,
    objective: template.objective,
    totalDailyBudget: pickTotalBudget(index, platforms, minBudget, limit),
    creative: {
      headline: fill(template.headline),
      primaryText: fill(template.primaryText),
      landingUrl: `${LANDING_SITE}${template.path}?utm_source=adhub&utm_medium=paid&utm_campaign=${template.slug}-${day}`,
    },
  };
}

/** The first round total, starting from this template's usual size, whose even split fits every channel. */
function pickTotalBudget(
  index: number,
  platforms: readonly Platform[],
  minBudget: ReadonlyMap<Platform, number>,
  limit: number | null,
): number {
  if (platforms.length === 0) return TOTAL_BUDGETS[0];
  const shares = splitEvenly(platforms);
  const fits = (total: number) =>
    allocateBudget(
      total,
      platforms.map((platform) => ({ platform, percent: shares[platform] ?? 0 })),
    ).every(
      (a) =>
        a.dailyBudget >= (minBudget.get(a.platform) ?? 0) &&
        (limit === null || a.dailyBudget <= limit),
    );

  const start = index % TOTAL_BUDGETS.length;
  const ordered = [...TOTAL_BUDGETS.slice(start), ...TOTAL_BUDGETS.slice(0, start)];
  const preset = ordered.find(fits);
  if (preset !== undefined || limit === null) return preset ?? TOTAL_BUDGETS[0];

  // A tight cap rules out every preset: take the largest round total whose biggest share stays under it.
  const largestShare = Math.max(...platforms.map((p) => shares[p] ?? 0));
  const ceiling = Math.floor((limit * 100) / largestShare / 1000) * 1000;
  for (let total = ceiling; total >= 1000; total -= 1000) if (fits(total)) return total;
  return ceiling;
}
