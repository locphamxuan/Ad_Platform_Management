import { CTA_BY_OBJECTIVE } from '../../components/AdPreview';
import { formatDate, formatDecimal, formatPercent, formatVnd } from '../../lib/format';
import { campaignHealth, percentChange, type Health } from '../../lib/insights';
import type { AdAccountOption, CampaignDetail, Creative, DailyPoint, Objective } from '../../lib/types';
import { generateCreatives, parseBrief, reviewCreative } from '../create-campaign/brief';

/** What the assistant says about one campaign; plain functions so they can be tested. */

export interface CampaignSummary {
  health: Health;
  headline: string;
  points: string[];
}

const trend = (change: number | null, noun: string) =>
  change === null ? '' : Math.abs(change) < 0.5 ? `${noun} không đổi` : `${noun} ${change > 0 ? 'tăng' : 'giảm'} ${formatPercent(Math.abs(change))}`;

/** The day with the best return, or the most conversions when nothing earned revenue. */
export function bestDay(daily: readonly DailyPoint[]): DailyPoint | null {
  const delivered = daily.filter((d) => d.spend > 0);
  if (delivered.length < 2) return null;
  const value = (d: DailyPoint) => (d.revenue > 0 ? d.revenue / d.spend : d.conversions);
  return delivered.reduce((best, d) => (value(d) > value(best) ? d : best));
}

export function summarizeCampaign(detail: CampaignDetail, accountCpa: number): CampaignSummary {
  const { campaign, previousKpis: before, daily } = detail;
  const { kpis } = campaign;
  const health = campaignHealth(kpis, accountCpa);

  if (kpis.spend === 0) {
    return {
      health,
      headline:
        campaign.status === 'PAUSED'
          ? 'Chiến dịch đang tạm dừng và chưa chi tiêu trong kỳ này.'
          : 'Chiến dịch chưa phân phối trong kỳ này — kiểm tra nội dung và ngân sách trên nền tảng.',
      points: [],
    };
  }

  const headline =
    health.label === 'Tốt'
      ? `Chiến dịch đang hiệu quả — ROAS ${formatDecimal(kpis.roas)}x, đáng cân nhắc mở rộng.`
      : health.label === 'Ổn'
        ? `Hiệu quả ở mức ổn (ROAS ${formatDecimal(kpis.roas)}x), vẫn còn chỗ tối ưu.`
        : `Chiến dịch cần xem lại — ROAS ${formatDecimal(kpis.roas)}x, dưới mức mong đợi.`;

  const points = [
    `Đã chi ${formatVnd(kpis.spend)}, thu về ${formatVnd(kpis.revenue)} từ ${kpis.conversions} chuyển đổi (CPA ${formatVnd(kpis.cpa)}).`,
  ];
  const changes = [trend(percentChange(kpis.roas, before.roas), 'ROAS'), trend(percentChange(kpis.cpa, before.cpa), 'CPA')]
    .filter(Boolean)
    .join(', ');
  if (before.spend > 0 && changes) points.push(`So với kỳ trước: ${changes}.`);
  if (accountCpa > 0 && kpis.conversions > 0) {
    const ratio = kpis.cpa / accountCpa;
    if (ratio <= 0.85) points.push(`CPA thấp hơn ${formatPercent((1 - ratio) * 100)} so với mức thường gặp của các chiến dịch khác.`);
    else if (ratio >= 1.2) points.push(`CPA cao hơn ${formatPercent((ratio - 1) * 100)} so với mức thường gặp — nên rà lại tệp và nội dung.`);
  }
  const best = bestDay(daily);
  if (best) {
    points.push(
      best.revenue > 0
        ? `Ngày hiệu quả nhất: ${formatDate(best.date)} với ROAS ${formatDecimal(best.revenue / best.spend)}x.`
        : `Ngày nhiều chuyển đổi nhất: ${formatDate(best.date)} (${best.conversions}).`,
    );
  }
  return { health, headline, points };
}

/** One sentence on where the campaign should run, for the top of the account section. */
export function describeAdvice(accounts: readonly AdAccountOption[]): { tone: 'positive' | 'ai' | 'caution'; text: string } | null {
  if (accounts.length === 0) return null;
  const best = accounts.find((a) => a.recommended);
  const current = accounts.find((a) => a.current);
  if (!best) return { tone: 'caution', text: 'Không tài khoản nào đủ điều kiện chạy thêm — kiểm tra trạng thái và hạn mức chi tiêu.' };
  if (accounts.length === 1) return { tone: 'positive', text: `Kết nối này chỉ có một tài khoản quảng cáo: "${best.name}".` };
  if (best.current) return { tone: 'positive', text: `Chiến dịch đang chạy ở tài khoản phù hợp nhất ("${best.name}", ${best.fit.score}/100).` };
  const gap = current ? ` so với ${current.fit.score} của tài khoản hiện tại` : '';
  return { tone: 'ai', text: `Nên chạy trên "${best.name}" — điểm phù hợp ${best.fit.score}/100${gap}.` };
}

/** The same sentence when looking at another platform's accounts, where nothing runs yet. */
export function describeOtherPlatform(
  accounts: readonly AdAccountOption[],
  platformLabel: string,
): { tone: 'positive' | 'ai' | 'caution'; text: string } | null {
  if (accounts.length === 0) return null;
  const best = accounts.find((a) => a.recommended);
  if (!best) return { tone: 'caution', text: `Không tài khoản ${platformLabel} nào đủ điều kiện — kiểm tra trạng thái và hạn mức chi tiêu.` };
  return {
    tone: 'ai',
    text: `Nếu mở rộng sang ${platformLabel}, nên dùng "${best.name}" — điểm phù hợp ${best.fit.score}/100 trong ${accounts.length} tài khoản.`,
  };
}

export interface CopyVariant extends Creative {
  angle: string;
  score: number;
}

/** "[Demo] TT - Livestream ưu đãi" → "Livestream ưu đãi": the words that describe the offer. */
const offerOf = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, '').replace(/^\s*[A-Z]{2,3}\s*-\s*/, '').trim();

/**
 * Alternative ad copy for a running campaign, written by the same rules as the campaign creator,
 * from its headline and then its name, so there are several angles to page through. Best-scoring
 * first; the landing page is kept.
 */
export function suggestVariants(campaign: { name: string; objective: Objective; creative: Creative }): CopyVariant[] {
  const { creative } = campaign;
  const sources = [creative.headline, offerOf(campaign.name)];
  const seen = new Set([`${creative.headline}|${creative.primaryText}`]);
  const variants: CopyVariant[] = [];
  for (const source of sources) {
    const brief = parseBrief(source);
    // "Livestream 20h – giảm 40%" leaves "Livestream 20h –" once the discount is taken out.
    const product = brief.product.replace(/[\s–—:,.;|-]+$/u, '').trim();
    if (!product) continue;
    for (const v of generateCreatives({ ...brief, product, objective: campaign.objective })) {
      const key = `${v.headline}|${v.primaryText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const next = { headline: v.headline, primaryText: v.primaryText, landingUrl: creative.landingUrl };
      variants.push({ ...next, angle: v.angle, score: reviewCreative(next).score });
    }
  }
  return variants.sort((a, b) => b.score - a.score);
}

/** Advice on the call-to-action, as Ads Manager gives it next to the button picker. */
export function ctaAdvice(objective: Objective): { label: string; reason: string } {
  const label = CTA_BY_OBJECTIVE[objective];
  const reason: Record<Objective, string> = {
    sales: '"Mua ngay" nói rõ bước tiếp theo nên thường cho tỉ lệ chuyển đổi cao hơn với mục tiêu doanh số.',
    leads: '"Đăng ký" khớp với biểu mẫu thu thông tin, giảm người bấm nhầm và hạ giá mỗi khách tiềm năng.',
    traffic: '"Tìm hiểu thêm" ít cam kết nên thu hút nhiều lượt nhấp nhất cho mục tiêu lưu lượng.',
    awareness: '"Tìm hiểu thêm" giữ quảng cáo nhẹ nhàng, hợp với mục tiêu nhận diện.',
  };
  return { label, reason: reason[objective] };
}
