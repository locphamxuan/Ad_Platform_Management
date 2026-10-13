import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PLATFORM_META } from '../../lib/constants';
import {
  formatCompactVnd,
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatVnd,
  lastNDays,
} from '../../lib/format';
import { NAV_ITEMS } from '../../lib/navigation';
import { queryKeys } from '../../lib/query-keys';
import type { DashboardSummary, Kpis, Platform } from '../../lib/types';

export const DESIGN_OPTIONS = [
  { id: 'a', name: 'Sảnh tối', layout: 'Thanh bên trái tối, thẻ số liệu dạng lưới, nhấn vàng champagne' },
  { id: 'b', name: 'Tạp chí', layout: 'Thanh điều hướng ngang, một con số lớn làm tiêu điểm, bố cục biên tập hai cột' },
  { id: 'c', name: 'Buồng lái', layout: 'Thanh biểu tượng hẹp, vùng chính và cột phân tích bên phải (3 cột)' },
  { id: 'd', name: 'Bento', layout: 'Không thanh bên; ô bento nhiều kích thước, thanh điều hướng nổi ở đáy' },
  { id: 'e', name: 'Sổ cái', layout: 'Bảng số liệu là trung tâm, dải chỉ số chạy ngang, điều hướng dạng tab' },
] as const;

export type DesignOptionId = (typeof DESIGN_OPTIONS)[number]['id'];

/** Every option shows the same real data (last 14 days) so only the design differs. */
export function useDesignData() {
  const range = lastNDays(14);
  return useQuery<DashboardSummary>({
    queryKey: queryKeys.dashboard(range.from, range.to),
    queryFn: () => api.dashboard.summary(range),
  });
}

/** Navigation entries the signed-in role may see; previews link to the real screens. */
export function useNavItems() {
  const { can } = useAuth();
  return NAV_ITEMS.filter((item) => can(item.permission));
}

export const platformLabel = (platform: Platform) => PLATFORM_META[platform].label;
export const platformColor = (platform: Platform) => PLATFORM_META[platform].color;

export const kpiList = (t: Kpis) => [
  { label: 'Chi tiêu', value: formatVnd(t.spend), hint: `CPM ${formatVnd(t.cpm)}` },
  { label: 'Lượt click', value: formatNumber(t.clicks), hint: `CTR ${formatPercent(t.ctr)}` },
  { label: 'Chuyển đổi', value: formatNumber(t.conversions), hint: `CPC ${formatVnd(t.cpc)}` },
  { label: 'CPA', value: formatVnd(t.cpa), hint: 'Chi phí mỗi chuyển đổi' },
  { label: 'ROAS', value: `${formatDecimal(t.roas)}x`, hint: `Doanh thu ${formatVnd(t.revenue)}` },
];

export const daySpend = (day: DashboardSummary['dailySpend'][number]) =>
  (day.facebook ?? 0) + (day.tiktok ?? 0) + (day.google ?? 0);

/** Stacked daily spend bars in plain CSS, so each option can restyle them freely. */
export function SpendBars({
  data,
  height = 160,
  track = 'transparent',
  labelClass = 'text-current opacity-60',
  monochrome,
}: {
  data: DashboardSummary;
  height?: number;
  track?: string;
  labelClass?: string;
  /** One colour for all platforms instead of platform colours */
  monochrome?: string;
}) {
  const max = Math.max(1, ...data.dailySpend.map(daySpend));
  const first = data.dailySpend[0];
  const last = data.dailySpend[data.dailySpend.length - 1];
  return (
    <div>
      <div className="flex items-end gap-[3px] sm:gap-1.5" style={{ height }} role="img" aria-label="Chi tiêu theo ngày">
        {data.dailySpend.map((day) => (
          <div
            key={day.date}
            className="flex h-full flex-1 flex-col-reverse overflow-hidden rounded-sm"
            style={{ background: track }}
            title={`${formatDate(day.date)}: ${formatCompactVnd(daySpend(day))}`}
          >
            {data.byPlatform.map(({ platform }) => (
              <div
                key={platform}
                style={{
                  height: `${((day[platform] ?? 0) / max) * 100}%`,
                  background: monochrome ?? platformColor(platform),
                  opacity: monochrome ? 0.55 + 0.15 * data.byPlatform.findIndex((p) => p.platform === platform) : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className={`mt-2 flex justify-between text-[10px] ${labelClass}`}>
        <span>{first && formatDate(first.date)}</span>
        <span>{last && formatDate(last.date)}</span>
      </div>
    </div>
  );
}

/** Bar under the option showing which one is on screen, with links to the others. */
export function OptionSwitcher({ current, dark }: { current: DesignOptionId; dark?: boolean }) {
  return (
    <nav
      aria-label="Chuyển phương án giao diện"
      className={`flex flex-wrap items-center gap-2 px-4 py-2 text-xs ${dark ? 'bg-black text-white/80' : 'bg-[#16181D] text-white/80'}`}
    >
      <Link to="/phuong-an" className="mr-2 font-semibold text-white underline-offset-4 hover:underline">
        Phương án giao diện
      </Link>
      {DESIGN_OPTIONS.map((option) => (
        <Link
          key={option.id}
          to={`/phuong-an/${option.id}`}
          aria-current={option.id === current ? 'page' : undefined}
          className={`rounded px-2 py-1 ${option.id === current ? 'bg-white font-semibold text-black' : 'hover:bg-white/10'}`}
        >
          {option.id.toUpperCase()} · {option.name}
        </Link>
      ))}
    </nav>
  );
}
