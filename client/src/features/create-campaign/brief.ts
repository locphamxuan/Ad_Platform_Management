import { AMOUNT_PATTERN, fold, readAmount } from '../../lib/text';
import type { CreateUnifiedCampaignInput, Objective } from '../../lib/types';

/**
 * Turns a one-line brief ("Giảm 30% giày chạy bộ dịp 11.11, ngân sách 3 triệu/ngày") into a full
 * campaign: name, objective, budget, three ad copy variants and a tracked landing link.
 */

export interface Brief {
  product: string;
  objective: Objective;
  /** Total per day in VND, when the brief states one */
  totalDailyBudget?: number;
  /** Percent off, when the brief states one */
  discount?: number;
  occasion?: string;
  landingUrl?: string;
}

/** Checked in order: a stated sign-up beats a discount, a discount beats a launch. */
const OBJECTIVE_HINTS: [Objective, RegExp][] = [
  ['engagement', /tin nhan|inbox|mess|nhan tin|tu van qua (tin|mess)|tuong tac|cmt|comment|binh luan|like/],
  ['app_promotion', /tai app|cai app|ung dung|cai dat|download app|app store|ch play/],
  ['leads', /dang ky|tu van|\bform\b|\blead|thu thap|de lai (so|thong tin)|dat lich|hotline/],
  ['sales', /\bgiam\b|\bsale\b|khuyen mai|uu dai|mua ngay|mua \d|dat hang|don hang|chuyen doi|flash|voucher|freeship|\boff\b/],
  ['traffic', /ra mat|truy cap|\bwebsite\b|\bweb\b|bai viet|\bblog\b|kham pha|luot xem trang/],
  ['awareness', /thuong hieu|nhan dien|\bbrand|lan toa|\breach\b|do phu/],
];

const OCCASIONS: [string, RegExp][] = [
  ['11.11', /11[./]11/],
  ['12.12', /12[./]12/],
  ['10.10', /10[./]10/],
  ['Black Friday', /black ?friday/],
  ['Tết', /\btet\b/],
  ['Trung thu', /trung thu/],
  ['Giáng sinh', /giang sinh|\bnoel\b/],
  ['20/10', /20[./]10/],
  ['8/3', /\b8[./]3\b/],
  ['Cuối tuần', /cuoi tuan/],
];

const FILLER = /^(chay |tao |len )?(chien dich |quang cao |ads? )*(cho |ve |ban |gioi thieu |tang nhan dien |thu thap )?/;

export function parseBrief(input: string): Brief {
  const source = input.normalize('NFC');
  const text = fold(source);
  const spans: [number, number][] = [];
  const take = (re: RegExp) => {
    const match = re.exec(text);
    if (match) spans.push([match.index, match.index + match[0].length]);
    return match;
  };

  const url = take(/https?:\/\/[^\s,;]+/);
  const budget =
    take(new RegExp(String.raw`(ngan sach|\bns\b|budget)\s*(tong\s*)?(khoang\s*)?:?\s*${AMOUNT_PATTERN}(\s*(d|vnd|dong))?(\s*(\/|moi|1)\s*ngay)?`)) ??
    take(new RegExp(String.raw`${AMOUNT_PATTERN}(\s*(d|vnd|dong))?\s*(\/|moi|1)\s*ngay`));
  const budgetValue = budget ? readBudget(budget) : undefined;
  const discountMatch = take(/(giam|sale|off|uu dai)\s*(gia\s*)?(den\s*)?(\d{1,2})\s*%|(?<!\d)(\d{1,2})\s*%\s*(off)?/);
  const discount = discountMatch ? Number(discountMatch[4] ?? discountMatch[5]) : undefined;
  const occasion = OCCASIONS.find(([, re]) => re.test(text));
  if (occasion) {
    const m = occasion[1].exec(text);
    // "dịp 11.11" / "nhân dịp Tết": drop the connector with the occasion itself.
    if (m) {
      const lead = /(nhan dip|dip|mua|vao)\s*$/.exec(text.slice(0, m.index));
      spans.push([lead ? lead.index : m.index, m.index + m[0].length]);
    }
  }

  const objective = OBJECTIVE_HINTS.find(([, re]) => re.test(text))?.[0] ?? 'sales';

  return {
    product: extractProduct(source, text, spans),
    objective,
    totalDailyBudget: budgetValue && budgetValue >= 1000 ? Math.round(budgetValue / 1000) * 1000 : undefined,
    discount: discount && discount > 0 && discount < 100 ? discount : undefined,
    occasion: occasion?.[0],
    landingUrl: url?.[0],
  };
}

function readBudget(match: RegExpExecArray): number {
  // Both patterns capture AMOUNT_PATTERN's number and unit; find them by shape.
  const groups = match.slice(1);
  const index = groups.findIndex((g) => g !== undefined && /^\d/.test(g));
  const amount = readAmount(groups[index], groups[index + 1]);
  // "ngân sách 3" with no unit almost always means millions.
  return amount < 1000 ? amount * 1_000_000 : amount;
}

/** What is left once the budget, link, discount and occasion are cut out: the product or offer. */
function extractProduct(source: string, text: string, spans: [number, number][]): string {
  let kept = '';
  let keptFolded = '';
  for (let i = 0; i < source.length; i++) {
    const removed = spans.some(([from, to]) => i >= from && i < to);
    kept += removed ? ' ' : source[i];
    keptFolded += removed ? ' ' : text[i];
  }
  // First clause only; later clauses usually hold targeting notes.
  const clauseEnd = keptFolded.search(/[,.;\n]|\s-\s/);
  let clause = clauseEnd === -1 ? kept : kept.slice(0, clauseEnd);
  let clauseFolded = clauseEnd === -1 ? keptFolded : keptFolded.slice(0, clauseEnd);
  const lead = /^\s*/.exec(clauseFolded)?.[0].length ?? 0;
  clause = clause.slice(lead);
  clauseFolded = clauseFolded.slice(lead);
  const filler = FILLER.exec(clauseFolded)?.[0].length ?? 0;
  const product = clause.slice(filler).replace(/\s+/g, ' ').trim().slice(0, 60);
  return product ? product.charAt(0).toUpperCase() + product.slice(1) : 'Sản phẩm nổi bật';
}

export interface CreativeVariant {
  angle: string;
  headline: string;
  primaryText: string;
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Three angles on the same offer, so the user picks one instead of writing from scratch. Copy stays
 * industry-neutral (works for goods, services, courses, local shops or a personal brand) and makes
 * no factual claim the advertiser did not state: no invented customer counts, deadlines or warranties.
 */
export function generateCreatives(brief: Brief): CreativeVariant[] {
  const product = brief.product;
  const p = lower(product);
  const offer = brief.discount ? `giảm đến ${brief.discount}%` : null;
  const when = brief.occasion ? ` dịp ${brief.occasion}` : '';
  const byObjective: Record<Objective, CreativeVariant[]> = {
    sales: [
      {
        angle: 'Ưu đãi',
        headline: offer ? `${product} ${offer}${when}` : `${product} – ưu đãi riêng${when}`,
        primaryText: `${offer ? `${capitalize(offer)} cho ${p}` : `Ưu đãi dành riêng cho ${p}`}${when}. Chọn ngay phương án phù hợp với bạn và đặt hôm nay!`,
      },
      {
        angle: 'Khan hiếm',
        headline: `Ưu đãi có hạn: ${p}${offer ? ` ${offer}` : ''}`,
        primaryText: `Ưu đãi${when} chỉ áp dụng trong thời gian có hạn. Đừng bỏ lỡ cơ hội trải nghiệm ${p} — đặt ngay hôm nay!`,
      },
      {
        angle: 'Lợi ích',
        headline: `${product}: đáng giá từng đồng`,
        primaryText: `${product} giúp bạn tiết kiệm thời gian và nhận đúng giá trị mình cần${offer ? ` — nay còn ${offer}` : ''}. Tìm hiểu và đặt ngay!`,
      },
    ],
    leads: [
      {
        angle: 'Miễn phí',
        headline: `Nhận tư vấn ${p} miễn phí`,
        primaryText: `Để lại thông tin, chúng tôi sẽ liên hệ để tư vấn ${p} phù hợp nhất với nhu cầu của bạn. Hoàn toàn miễn phí.`,
      },
      {
        angle: 'Ưu đãi đăng ký',
        headline: offer ? `Đăng ký hôm nay – ${offer}` : `Đăng ký sớm, nhận ưu đãi riêng`,
        primaryText: `Đăng ký tìm hiểu ${p}${when} để nhận ${offer ?? 'ưu đãi dành riêng'} cho khách đăng ký sớm. Đăng ký ngay!`,
      },
      {
        angle: 'Chuyên gia',
        headline: `Giải pháp ${p} cho riêng bạn`,
        primaryText: `Chúng tôi lắng nghe nhu cầu và đề xuất ${p} phù hợp với mục tiêu, ngân sách của bạn. Đăng ký nhận tư vấn!`,
      },
    ],
    traffic: [
      {
        angle: 'Khám phá',
        headline: `Khám phá ${p}`,
        primaryText: `${product}${when} đã sẵn sàng. Xem chi tiết, so sánh các lựa chọn và tìm phương án hợp với bạn nhất.`,
      },
      {
        angle: 'Tò mò',
        headline: `Điều gì làm nên khác biệt của ${p}?`,
        primaryText: `Tìm hiểu điều làm nên khác biệt của ${p} — chỉ mất vài phút. Xem chi tiết tại website!`,
      },
      {
        angle: 'Hướng dẫn',
        headline: `Cách chọn ${p} phù hợp`,
        primaryText: `Bí quyết chọn ${p} đúng nhu cầu, đúng ngân sách${offer ? `, kèm ${offer}` : ''}. Xem hướng dẫn ngay.`,
      },
    ],
    awareness: [
      {
        angle: 'Thương hiệu',
        headline: `${product} – lựa chọn đáng tin cậy`,
        primaryText: `${product} — luôn đặt trải nghiệm của bạn lên hàng đầu. Theo dõi để không bỏ lỡ những điều mới nhất.`,
      },
      {
        angle: 'Câu chuyện',
        headline: `Câu chuyện đằng sau ${p}`,
        primaryText: `Từ ý tưởng đến từng chi tiết, ${p} được làm ra với sự tỉ mỉ và tâm huyết. Khám phá hành trình của chúng tôi.`,
      },
      {
        angle: 'Cảm xúc',
        headline: `${product} – trọn vẹn từng khoảnh khắc`,
        primaryText: `Mỗi khoảnh khắc đều xứng đáng được nâng niu. ${product} — đồng hành cùng bạn trong từng ngày.`,
      },
    ],
    engagement: [
      {
        angle: 'Tư vấn',
        headline: `Nhắn tin ngay để nhận tư vấn ${p}`,
        primaryText: `Bạn cần tìm hiểu về ${p}${when}? Nhắn tin ngay cho chúng tôi để được tư vấn chi tiết và giải đáp mọi thắc mắc!`,
      },
      {
        angle: 'Ưu đãi inbox',
        headline: offer ? `Nhắn tin nhận ${offer} cho ${p}` : `Nhắn tin ngay – Nhận ưu đãi riêng`,
        primaryText: `Inbox ngay để nhận thông tin ưu đãi ${p}${when}. Đội ngũ hỗ trợ phản hồi trong vài phút!`,
      },
      {
        angle: 'Trò chuyện',
        headline: `Hỏi nhanh về ${product}`,
        primaryText: `Có thắc mắc gì về ${product}? Hãy gửi tin nhắn cho chúng tôi để được trợ giúp tức thì.`,
      },
    ],
    app_promotion: [
      {
        angle: 'Trải nghiệm',
        headline: `Tải ứng dụng ${product} ngay hôm nay`,
        primaryText: `Trải nghiệm tiện ích vượt trội cùng ứng dụng ${product}. Tải ngay trên App Store & Google Play!`,
      },
      {
        angle: 'Ưu đãi trên app',
        headline: offer ? `Tải app nhận ngay ${offer}` : `Tải app để nhận ưu đãi độc quyền`,
        primaryText: `Cài đặt ứng dụng ${product}${when} để nhận ngay ưu đãi dành riêng cho người dùng mới. Tải ngay!`,
      },
      {
        angle: 'Nhanh chóng & Tiện lợi',
        headline: `${product} ngay trong tầm tay bạn`,
        primaryText: `Mọi thao tác quản lý và đặt mua nhanh hơn bao giờ hết trên ứng dụng ${product}. Cài đặt miễn phí!`,
      },
    ],
  };
  return byObjective[brief.objective].map((v) => ({
    angle: v.angle,
    headline: v.headline.slice(0, 100),
    primaryText: v.primaryText.slice(0, 500),
  }));
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** URL-safe ASCII slug for names and UTM tags. */
export function slugify(text: string): string {
  return (
    fold(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'chien-dich'
  );
}

/** Adds UTM tags (keeping any already there) so platform traffic is attributable. */
export function withUtm(url: string, campaign: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('utm_source')) parsed.searchParams.set('utm_source', 'adhub');
    if (!parsed.searchParams.has('utm_medium')) parsed.searchParams.set('utm_medium', 'paid');
    if (!parsed.searchParams.has('utm_campaign')) parsed.searchParams.set('utm_campaign', campaign);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function campaignNameFor(brief: Brief, now: Date): string {
  const month = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const name = brief.occasion ? `${brief.occasion} – ${brief.product}` : `${brief.product} ${month}`;
  return name.slice(0, 120);
}

export interface CreativeReview {
  score: number;
  tips: string[];
}

const CTA = /\b(mua|dat|dang ky|nhan|xem|kham pha|lien he|goi|tim hieu|san|chon)\b/;

/** A quick quality check of the ad text, with what to fix first. */
export function reviewCreative(creative: CreateUnifiedCampaignInput['creative']): CreativeReview {
  const tips: string[] = [];
  let score = 0;
  const headline = creative.headline.trim();
  const text = creative.primaryText.trim();

  if (headline.length >= 15 && headline.length <= 60) score += 20;
  else tips.push(headline.length < 15 ? 'Tiêu đề hơi ngắn — nêu rõ sản phẩm và lợi ích.' : 'Tiêu đề dài hơn 60 ký tự dễ bị cắt trên di động.');

  if (/\d/.test(headline)) score += 15;
  else tips.push('Thêm con số cụ thể (giảm %, giá, thời hạn) vào tiêu đề để tăng CTR.');

  if (text.length >= 80 && text.length <= 300) score += 20;
  else tips.push(text.length < 80 ? 'Nội dung chính nên dài 80–300 ký tự để đủ thuyết phục.' : 'Nội dung chính quá dài; giữ dưới 300 ký tự.');

  if (CTA.test(fold(text))) score += 20;
  else tips.push('Kết thúc bằng lời kêu gọi hành động rõ ràng (Mua ngay, Đăng ký…).');

  let url: URL | null = null;
  try {
    url = new URL(creative.landingUrl);
  } catch {
    url = null;
  }
  if (url && url.protocol === 'https:' && url.hostname.includes('.')) score += 15;
  else tips.push('Link đích cần là địa chỉ https hợp lệ.');

  if (url?.searchParams.has('utm_campaign')) score += 10;
  else tips.push('Gắn UTM vào link để đo được nguồn chuyển đổi.');

  return { score, tips };
}
