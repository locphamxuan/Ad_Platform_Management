import { useState } from 'react';
import type { CampaignDraftPayload, Objective, Platform, SpecialCategory } from '../../../lib/types';
import { OBJECTIVE_LABELS, PLATFORMS, PLATFORM_META } from '../../../lib/constants';
import { Field, PlatformTag } from '../../../components/ui';
import { parseBrief, generateCreatives } from '../brief';

interface GoalStepProps {
  payload: Partial<CampaignDraftPayload>;
  onChange: (patch: Partial<CampaignDraftPayload>) => void;
  errors?: Record<string, string>;
  expertMode?: boolean;
}

interface ObjectiveMetaInfo {
  id: Objective;
  title: string;
  metaCode: string;
  icon: 'target' | 'globe' | 'message' | 'users' | 'phone' | 'wallet';
  what: string;
  outcome: string;
  when: string;
  needs: string;
  optimizes: string;
  example: string;
  destinations: Array<{
    id: string;
    title: string;
    goal: string;
    cta: string;
    optimizes: string;
    enabled: boolean;
  }>;
  readiness: {
    labels: Array<'CÓ THỂ CHỌN' | 'CHƯA XÁC MINH META' | 'THIẾU TÀI SẢN' | 'CẦN THÊM THÔNG TIN'>;
    metaNote?: string;
  };
  enabled: boolean;
}

const META_OBJECTIVES_DATA: ObjectiveMetaInfo[] = [
  {
    id: 'awareness',
    title: 'Nhận diện thương hiệu',
    metaCode: 'OUTCOME_AWARENESS',
    icon: 'target',
    what: 'Tăng mức độ nhận biết thương hiệu, tiếp cận nhiều người nhất có thể.',
    outcome: 'Số người tiếp cận (Reach), nhận thức thương hiệu, lượt xem video.',
    when: 'Mới ra mắt sản phẩm, mở rộng độ phủ ở khu vực mới, phủ sóng thương hiệu.',
    needs: 'Trang Fanpage đang hoạt động, hình ảnh hoặc video ngắn ấn tượng.',
    optimizes: 'Lượt tiếp cận tối đa (Reach) hoặc Lượt hiển thị (Impressions).',
    example: 'Giới thiệu thương hiệu thời trang mới mở tại TP.HCM.',
    destinations: [
      { id: 'POST_ENGAGEMENT', title: 'Trên bài viết Fanpage (Dark Post)', goal: 'awareness', cta: 'Tìm hiểu thêm', optimizes: 'Số người tiếp cận (Reach)', enabled: true },
    ],
    readiness: { labels: ['CÓ THỂ CHỌN', 'CHƯA XÁC MINH META'], metaNote: 'Meta xác minh chính sách ở bước Kiểm tra & Tạo' },
    enabled: true,
  },
  {
    id: 'traffic',
    title: 'Lưu lượng truy cập',
    metaCode: 'OUTCOME_TRAFFIC',
    icon: 'globe',
    what: 'Thúc đẩy lượt truy cập chất lượng cao vào liên kết/trang web hoặc trang đích.',
    outcome: 'Lượt nhấp vào liên kết (Link Clicks) và Lượt xem trang đích (Landing Page Views).',
    when: 'Cần dẫn khách đọc bài viết blog, xem thông tin dự án, landing page bán hàng.',
    needs: 'Đường dẫn trang web (URL) hợp lệ, tốc độ tải trang nhanh, thân thiện di động.',
    optimizes: 'Lượt xem trang đích (Landing Page Views) hoặc Lượt nhấp liên kết (Link Clicks).',
    example: 'Kéo traffic vào trang giới thiệu căn hộ condotel nghỉ dưỡng.',
    destinations: [
      { id: 'WEBSITE', title: 'Trang web / Landing page', goal: 'traffic', cta: 'Tìm hiểu thêm', optimizes: 'Lượt xem trang đích (Landing Page Views)', enabled: true },
    ],
    readiness: { labels: ['CÓ THỂ CHỌN', 'CHƯA XÁC MINH META'], metaNote: 'Meta xác minh liên kết ở bước Tạo' },
    enabled: true,
  },
  {
    id: 'engagement',
    title: 'Lượt tương tác',
    metaCode: 'OUTCOME_ENGAGEMENT',
    icon: 'message',
    what: 'Tăng tương tác với bài viết, video hoặc nhắn tin trực tiếp với khách hàng tiềm năng.',
    outcome: 'Cuộc trò chuyện qua Messenger, lượt thích, bình luận, chia sẻ bài viết Dark Post.',
    when: 'Tư vấn chốt đơn qua inbox Messenger/WhatsApp, tạo bài viết viral có nhiều thảo luận.',
    needs: 'Fanpage có nhân sự trực tin nhắn, kịch bản trả lời tự động hoặc bài viết hấp dẫn.',
    optimizes: 'Cuộc trò chuyện qua tin nhắn (Messaging Conversations) hoặc Tương tác bài viết.',
    example: 'Chạy quảng cáo bài viết ẩn khuyến mãi nhận ưu đãi khi nhắn tin cho Page.',
    destinations: [
      { id: 'MESSAGES', title: 'Ứng dụng nhắn tin (Messenger / WhatsApp)', goal: 'engagement', cta: 'Gửi tin nhắn', optimizes: 'Cuộc trò chuyện mới', enabled: true },
      { id: 'POST_ENGAGEMENT', title: 'Trên bài viết của bạn (Dark Post R1–R7)', goal: 'engagement', cta: 'Tìm hiểu thêm', optimizes: 'Tương tác bài viết', enabled: true },
      { id: 'WEBSITE', title: 'Trang web (Xem nội dung)', goal: 'engagement', cta: 'Tìm hiểu thêm', optimizes: 'Lượt xem nội dung', enabled: true },
    ],
    readiness: { labels: ['CÓ THỂ CHỌN', 'CHƯA XÁC MINH META'], metaNote: 'Hỗ trợ quảng cáo Dark Post không hiện trên timeline công khai (R1–R7)' },
    enabled: true,
  },
  {
    id: 'leads',
    title: 'Thu thập khách tiềm năng',
    metaCode: 'OUTCOME_LEADS',
    icon: 'users',
    what: 'Thu thập thông tin khách hàng (Họ tên, SĐT, Email) qua biểu mẫu tức thì hoặc tin nhắn.',
    outcome: 'Biểu mẫu gửi thành công (Instant Forms), liên hệ tư vấn chất lượng.',
    when: 'Bất động sản, ô tô, giáo dục đào tạo, thẩm mỹ viện, dịch vụ tư vấn cao cấp.',
    needs: 'Biểu mẫu tức thì (Lead Form) trên Fanpage hoặc liên kết form trên website.',
    optimizes: 'Lượt điền biểu mẫu (Leads) với chi phí trên mỗi khách (CPA) tối ưu nhất.',
    example: 'Thu thập danh sách khách hàng đăng ký xem nhà mẫu cuối tuần.',
    destinations: [
      { id: 'INSTANT_FORMS', title: 'Biểu mẫu tức thì trên Meta (Instant Form)', goal: 'leads', cta: 'Đăng ký ngay', optimizes: 'Lượt điền biểu mẫu', enabled: true },
      { id: 'MESSAGES', title: 'Tin nhắn tự động thu thập SĐT', goal: 'leads', cta: 'Nhận báo giá', optimizes: 'Cuộc trò chuyện khách tiềm năng', enabled: true },
    ],
    readiness: { labels: ['CÓ THỂ CHỌN', 'CHƯA XÁC MINH META'], metaNote: 'Biểu mẫu mở trực tiếp trong Facebook, tỷ lệ chuyển đổi cao gấp 2-3 lần' },
    enabled: true,
  },
  {
    id: 'app_promotion',
    title: 'Quảng bá ứng dụng',
    metaCode: 'OUTCOME_APP_PROMOTION',
    icon: 'phone',
    what: 'Thu hút lượt cài đặt mới hoặc kích thích hành động người dùng trong ứng dụng di động.',
    outcome: 'Lượt cài đặt ứng dụng (App Installs), mở app, sự kiện mua sắm in-app.',
    when: 'Ứng dụng di động iOS / Android mới ra mắt cần tăng trưởng tệp người dùng.',
    needs: 'Ứng dụng đã đăng ký trên Meta for Developers và tích hợp Meta SDK.',
    optimizes: 'Lượt cài đặt ứng dụng (App Installs).',
    example: 'Tăng lượt tải ứng dụng đặt xe hoặc mua sắm trực tuyến.',
    destinations: [
      { id: 'APP_STORE', title: 'Cửa hàng ứng dụng (App Store / Google Play)', goal: 'app_promotion', cta: 'Cài đặt ngay', optimizes: 'Lượt cài đặt', enabled: false },
    ],
    readiness: { labels: ['THIẾU TÀI SẢN', 'CẦN THÊM THÔNG TIN'], metaNote: 'Tài khoản chưa đăng ký Meta SDK ứng dụng di động' },
    enabled: false,
  },
  {
    id: 'sales',
    title: 'Doanh số / Chuyển đổi',
    metaCode: 'OUTCOME_SALES',
    icon: 'wallet',
    what: 'Tối ưu hoá chuyển đổi đơn hàng và doanh số bán hàng từ người có khả năng mua cao nhất.',
    outcome: 'Đơn hàng hoàn tất (Purchase), Thêm vào giỏ hàng (Add to Cart), Doanh thu ROAS.',
    when: 'Doanh nghiệp bán lẻ, shop online, e-commerce có cổng thanh toán.',
    needs: 'Meta Pixel kích hoạt sự kiện Purchase hoặc Danh mục sản phẩm (Catalog).',
    optimizes: 'Sự kiện chuyển đổi giá trị cao nhất hoặc ROAS tối thiểu.',
    example: 'Thúc đẩy mua giày thể thao giảm giá 30% trực tiếp trên web.',
    destinations: [
      { id: 'WEBSITE', title: 'Trang web thương mại điện tử', goal: 'sales', cta: 'Mua ngay', optimizes: 'Lượt mua hàng (Purchase)', enabled: true },
    ],
    readiness: { labels: ['CÓ THỂ CHỌN', 'CHƯA XÁC MINH META'], metaNote: 'Khuyến nghị tối thiểu 50 lượt chuyển đổi/tuần để máy học Meta tối ưu tốt nhất' },
    enabled: true,
  },
];

const PRESET_TEMPLATES = [
  {
    title: 'Bất động sản & Căn hộ nghỉ dưỡng',
    desc: 'Thu thập SĐT khách hàng tiềm năng đăng ký tham quan nhà mẫu',
    objective: 'leads' as Objective,
    specialCategory: 'HOUSING' as SpecialCategory,
    destination: 'INSTANT_FORMS',
    dailyBudget: 2_000_000,
    headline: 'Sở hữu căn hộ nghỉ dưỡng Phú Quốc view biển — Chỉ từ 1,8 tỷ',
    primaryText: 'Dự án căn hộ nghỉ dưỡng cao cấp ven biển Phú Quốc. Chiết khấu ngay 12% khi thanh toán sớm, ngân hàng hỗ trợ vay 70% ân hạn nợ gốc 24 tháng. Đăng ký nhận bảng giá và vé mời tham quan nhà mẫu ngay!',
    landingUrl: 'https://bosa-realestate.vn/phu-quoc',
  },
  {
    title: 'Flash Sale Thời trang & Phụ kiện 50%',
    desc: 'Thúc đẩy doanh số mua hàng trực tiếp trên website bán lẻ',
    objective: 'sales' as Objective,
    specialCategory: 'NONE' as SpecialCategory,
    destination: 'WEBSITE',
    dailyBudget: 800_000,
    headline: 'Đại tiệc Flash Sale - Giảm đến 50% toàn bộ BST mới',
    primaryText: 'Cơ hội mua sắm lớn nhất mùa thu đông! Hơn 1.000 sản phẩm thời trang cao cấp giảm kịch sàn đến 50%. Miễn phí giao hàng toàn quốc cho đơn từ 499k. Đặt hàng ngay trước khi hết size!',
    landingUrl: 'https://bosa-fashion.vn/flash-sale',
  },
  {
    title: 'F&B Mừng Khai Trương — Tặng Voucher 100k',
    desc: 'Khách gửi tin nhắn Messenger nhận voucher ẩm thực ưu đãi',
    objective: 'engagement' as Objective,
    specialCategory: 'NONE' as SpecialCategory,
    destination: 'MESSAGES',
    dailyBudget: 500_000,
    headline: 'Mừng khai trương chi nhánh mới — Nhận voucher 100k ngay!',
    primaryText: 'Chào đón cơ sở mới tại Quận 1! Bosa Kitchen gửi tặng voucher ẩm thực trị giá 100.000đ cho tất cả khách hàng nhắn tin đặt bàn trước. Menu hơn 50 món Á - Âu đặc sắc chờ bạn khám phá.',
    landingUrl: 'https://m.me/bosagroup',
  },
  {
    title: 'Khóa học Kỹ năng số & Digital Marketing',
    desc: 'Thu hút học viên quan tâm truy cập website tìm hiểu lộ trình',
    objective: 'traffic' as Objective,
    specialCategory: 'NONE' as SpecialCategory,
    destination: 'WEBSITE',
    dailyBudget: 600_000,
    headline: 'Khóa học Digital Marketing thực chiến 2026 — Từ cơ bản đến nâng cao',
    primaryText: 'Chương trình đào tạo thực chiến 30 ngày cùng chuyên gia hàng đầu. Nắm vững kỹ năng chạy ads Facebook, TikTok, Google và AI Automation. Xem chi tiết lộ trình và ưu đãi học phí sớm tại đây.',
    landingUrl: 'https://bosa-academy.vn/khoa-hoc-marketing',
  },
];

export function GoalStep({ payload, onChange, errors, expertMode: _expertMode }: GoalStepProps) {
  const [startMode, setStartMode] = useState<'ai' | 'template' | 'manual'>('manual');
  const [briefInput, setBriefInput] = useState('');
  const [briefAppliedNote, setBriefAppliedNote] = useState<string | null>(null);
  const [isConceptOpen, setIsConceptOpen] = useState(false);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [expandedObj, setExpandedObj] = useState<string | null>(null);
  const [showReservedWhy, setShowReservedWhy] = useState(false);
  const [tempAccountId, setTempAccountId] = useState(payload.accountId || 'act_1504039080130809');

  const selectedObjective = payload.objective || 'traffic';
  const selectedPlatforms = payload.platforms ?? ['facebook'];
  const buyingType = payload.buying_type || 'AUCTION';
  const setupMode = payload.setup_mode || 'recommended';
  const isAbEnabled = Boolean(payload.ab_plan?.enabled);
  const currentDestination = payload.destination || 'WEBSITE';

  const togglePlatform = (p: Platform) => {
    let next: Platform[];
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length === 1) return;
      next = selectedPlatforms.filter((item) => item !== p);
    } else {
      next = [...selectedPlatforms, p];
    }
    const share = Math.round(100 / next.length);
    const allocations = next.map((plat, idx) => ({
      platform: plat,
      percentage: idx === next.length - 1 ? 100 - share * (next.length - 1) : share,
    }));
    onChange({ platforms: next, allocations });
  };

  const handleApplyBrief = () => {
    if (!briefInput.trim()) return;
    const brief = parseBrief(briefInput);
    const variants = generateCreatives(brief);
    const variant = variants[0];
    const newPayload: Partial<CampaignDraftPayload> = {
      name: `${brief.product} ${new Date().toLocaleDateString('vi-VN')}`,
      objective: brief.objective,
      totalDailyBudget: brief.totalDailyBudget ?? payload.totalDailyBudget ?? 500_000,
      creative: {
        headline: variant ? variant.headline : (payload.creative?.headline || ''),
        primaryText: variant ? variant.primaryText : (payload.creative?.primaryText || ''),
        landingUrl: brief.landingUrl ?? (payload.creative?.landingUrl || 'https://'),
        cta: payload.creative?.cta || 'LEARN_MORE',
      },
    };
    onChange(newPayload);
    setBriefAppliedNote(`Đã tự động điền cấu hình từ AI Brief: ${brief.product}`);
    setBriefInput('');
  };

  const handleApplyTemplate = (tpl: typeof PRESET_TEMPLATES[0]) => {
    onChange({
      name: `${tpl.title} ${new Date().toLocaleDateString('vi-VN')}`,
      objective: tpl.objective,
      specialCategory: tpl.specialCategory,
      destination: tpl.destination,
      totalDailyBudget: tpl.dailyBudget,
      creative: {
        headline: tpl.headline,
        primaryText: tpl.primaryText,
        landingUrl: tpl.landingUrl,
        cta: tpl.destination === 'MESSAGES' ? 'SEND_MESSAGE' : tpl.objective === 'sales' ? 'SHOP_NOW' : 'LEARN_MORE',
      },
    });
    setBriefAppliedNote(`Đã áp dụng mẫu chiến dịch: «${tpl.title}»`);
  };

  const generateAutoName = () => {
    const now = new Date();
    const dStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const objLabel = OBJECTIVE_LABELS[selectedObjective] || 'Ads';
    const autoName = `BosaGroup-ADS-${objLabel.replace(/\s+/g, '')}-${dStr}`;
    onChange({ name: autoName });
  };

  const currentObjMeta = META_OBJECTIVES_DATA.find((o) => o.id === selectedObjective) || META_OBJECTIVES_DATA[1];

  return (
    <div className="space-y-6" data-testid="campaign-studio">
      {/* 1. Header & Quick Start */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Bước 1: Mục tiêu & Nền tảng quảng cáo
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Xác định mục tiêu kinh doanh cốt lõi, kênh phân phối và cấu trúc chiến dịch chuẩn Meta Graph API.
          </p>
        </div>

        {/* Start Choices Selector */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setStartMode('ai')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              startMode === 'ai'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            ✨ AI Brief
          </button>
          <button
            type="button"
            onClick={() => setStartMode('template')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              startMode === 'template'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            🎲 Mẫu chiến dịch Bosa Group
          </button>
          <button
            type="button"
            onClick={() => setStartMode('manual')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              startMode === 'manual'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            ⚙️ Tự thiết lập
          </button>
        </div>
      </div>

      {/* AI Brief Bar */}
      {startMode === 'ai' && (
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-pink-50/50 p-4 dark:border-purple-900/50 dark:from-purple-950/20 dark:via-indigo-950/10 dark:to-pink-950/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-xs font-bold text-white">✨</span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">
              Trợ lý tạo nhanh bằng AI Brief (Mô tả bằng lời)
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={briefInput}
              onChange={(e) => setBriefInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyBrief()}
              placeholder="Ví dụ: Giảm 20% căn hộ nghỉ dưỡng Phú Quốc, ngân sách 2 triệu/ngày, link https://phuquoc.vn"
              className="flex-1 rounded-xl border border-purple-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 shadow-inner focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-purple-800 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleApplyBrief}
              disabled={!briefInput.trim()}
              className="rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}

      {/* Preset Templates Selector */}
      {startMode === 'template' && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">🎲</span>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                Chọn mẫu chiến dịch tối ưu sẵn có của Bosa Group
              </span>
            </div>
            <span className="text-[11px] text-slate-500">1-click áp dụng toàn bộ cấu hình mẫu</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {PRESET_TEMPLATES.map((tpl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyTemplate(tpl)}
                className="flex flex-col items-start rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-blue-500 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500"
              >
                <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{tpl.title}</div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{tpl.desc}</div>
                <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 dark:bg-blue-950/60">{OBJECTIVE_LABELS[tpl.objective]}</span>
                  <span>{tpl.dailyBudget.toLocaleString('vi-VN')} ₫/ngày</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {briefAppliedNote && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>✓ {briefAppliedNote}</span>
          <button type="button" onClick={() => setBriefAppliedNote(null)} className="text-emerald-600 hover:underline">Đóng</button>
        </div>
      )}

      {/* 2. Concept Legend Accordion */}
      <div className="rounded-xl border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setIsConceptOpen(!isConceptOpen)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
        >
          <div className="flex items-center gap-2">
            <span className="text-blue-600 dark:text-blue-400">ℹ️</span>
            <span className="font-semibold">
              Phân biệt khái niệm Meta: Mục tiêu · Vị trí chuyển đổi · Mục tiêu hiệu quả · CTA/Đích đến · Hình thức mua
            </span>
          </div>
          <span className="text-slate-400">{isConceptOpen ? '▲ Thu gọn' : '▼ Chi tiết'}</span>
        </button>
        {isConceptOpen && (
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 dark:border-slate-800">
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">Mục tiêu chiến dịch:</span>
              <span className="text-slate-600 dark:text-slate-400"> Kết quả kinh doanh bạn hướng tới (Nhận biết, Lưu lượng, Tương tác, Khách tiềm năng, Doanh số).</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">Vị trí chuyển đổi:</span>
              <span className="text-slate-600 dark:text-slate-400"> Nơi khách hàng thực hiện hành động: Website, Messenger, Biểu mẫu tức thì (Instant Forms).</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">Mục tiêu hiệu quả:</span>
              <span className="text-slate-600 dark:text-slate-400"> Chỉ số Meta dùng thuật toán máy học tối ưu chi phí thấp nhất (Lượt nhấp, Tiếp cận, Tin nhắn, Đơn hàng).</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">CTA / Đích đến:</span>
              <span className="text-slate-600 dark:text-slate-400"> Nút kêu gọi hành động (Gửi tin nhắn, Tìm hiểu thêm, Mua ngay) và đường link trang đích.</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">Hình thức mua:</span>
              <span className="text-slate-600 dark:text-slate-400"> Đấu giá linh hoạt (AUCTION - mặc định) hoặc Đặt trước cố định tần suất tiếp cận (RESERVED).</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">Thử nghiệm A/B:</span>
              <span className="text-slate-600 dark:text-slate-400"> So sánh hai phương án phân tách chỉ khác nhau MỘT yếu tố duy nhất để kết luận khoa học.</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Objective Advisor (BẠN MUỐN ĐẠT KẾT QUẢ GÌ?) */}
      <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/30 to-white p-4 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              TRỢ LÝ TƯ VẤN: BẠN MUỐN QUẢNG CÁO MANG LẠI KẾT QUẢ GÌ?
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Chọn mong muốn kinh doanh thực tế, hệ thống sẽ đề xuất mục tiêu và nhánh tối ưu phù hợp nhất.
            </div>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            Kinh nghiệm Bosa Group
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { id: 'messages', label: '💬 Khách nhắn tin tư vấn', sub: 'Messenger / WhatsApp', goal: 'engagement' as Objective, dest: 'MESSAGES' },
            { id: 'website', label: '🌐 Khách vào Website / Landing page', sub: 'Xem thông tin dự án, blog', goal: 'traffic' as Objective, dest: 'WEBSITE' },
            { id: 'leads', label: '📋 Khách điền Form để lại SĐT', sub: 'Instant Forms trên Facebook', goal: 'leads' as Objective, dest: 'INSTANT_FORMS' },
            { id: 'sales', label: '🛍️ Khách mua hàng online', sub: 'Doanh số & Đơn hàng website', goal: 'sales' as Objective, dest: 'WEBSITE' },
            { id: 'awareness', label: '👁️ Nhận biết thương hiệu / Video', sub: 'Phủ sóng tệp khách hàng lớn', goal: 'awareness' as Objective, dest: 'POST_ENGAGEMENT' },
            { id: 'app', label: '📱 Tải ứng dụng di động', sub: 'Lượt cài đặt App Store', goal: 'app_promotion' as Objective, dest: 'APP_STORE' },
          ].map((item) => {
            const isMatch = selectedObjective === item.goal && currentDestination === item.dest;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange({ objective: item.goal, destination: item.dest });
                }}
                className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                  isMatch
                    ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.label}</span>
                <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{item.sub}</span>
                {isMatch && <span className="mt-1 text-[10px] font-bold text-blue-600">✓ Đang áp dụng</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Section A · Tài khoản quảng cáo */}
      <section aria-label="Tài khoản quảng cáo" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          A · Tài khoản quảng cáo
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Tài khoản chính ({payload.accountId || 'act_1504039080130809'})
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span>Đồng Việt Nam (VND)</span>
              <span>•</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Đang hoạt động (Meta v23.0)</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Đổi tài khoản
            </button>
            <button
              type="button"
              onClick={() => setIsHealthOpen(true)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              Xem sức khỏe 🩺
            </button>
          </div>
        </div>
      </section>

      {/* 5. Section B · Hình thức mua */}
      <section aria-label="Hình thức mua" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
          B · Hình thức mua (Buying Type)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChange({ buying_type: 'AUCTION' })}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              buyingType === 'AUCTION'
                ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Đấu giá (AUCTION)</span>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                {buyingType === 'AUCTION' ? 'Đang dùng' : 'Khuyến nghị'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Đấu giá theo thời gian thực của Meta, chi phí linh hoạt theo thị trường và chất lượng mẫu quảng cáo.
            </p>
          </button>

          <div
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left opacity-80 ${
              buyingType === 'RESERVED'
                ? 'border-amber-600 bg-amber-50/50 ring-1 ring-amber-600'
                : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Đặt trước (RESERVED)</span>
              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                Cần điều kiện
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cố định tần suất tiếp cận và chi phí CPM. Yêu cầu ngân sách lớn và tài khoản được Meta cấp quyền Reach & Frequency.
            </p>
            <button
              type="button"
              onClick={() => setShowReservedWhy(!showReservedWhy)}
              className="mt-2 text-[11px] font-semibold text-blue-600 hover:underline"
            >
              {showReservedWhy ? 'Ẩn điều kiện' : 'Vì sao chưa dùng được? ▼'}
            </button>
            {showReservedWhy && (
              <div className="mt-2 rounded-lg bg-white p-2.5 text-[11px] text-slate-600 shadow-inner dark:bg-slate-800 dark:text-slate-300">
                • Yêu cầu tài khoản có lịch sử chi tiêu &gt; 50.000.000 ₫ trong 30 ngày gần nhất.<br />
                • Meta Business Manager phải đạt trạng thái Doanh nghiệp đã xác minh.<br />
                • Thời gian chiến dịch tối thiểu 7 ngày với phạm vi tiếp cận cố định.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. Section C · Mục tiêu chiến dịch (Full 6 Meta Objectives) */}
      <section aria-label="Mục tiêu chiến dịch" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            C · Mục tiêu chiến dịch Meta Graph API (ODAX)
          </div>
          <span className="text-[11px] text-slate-500">6 mục tiêu chuẩn hoá của Meta</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {META_OBJECTIVES_DATA.map((obj) => {
            const isSelected = selectedObjective === obj.id;
            return (
              <div
                key={obj.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'border-2 border-blue-600 bg-blue-50/20 shadow-sm ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {obj.metaCode}
                      </span>
                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {obj.title}
                      </h4>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        ✓ ĐÃ CHỌN
                      </span>
                    )}
                  </div>

                  {/* Readiness Badges */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {obj.readiness.labels.map((lbl, idx) => (
                      <span
                        key={idx}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          lbl === 'CÓ THỂ CHỌN'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : lbl === 'CHƯA XÁC MINH META'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>

                  <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300">
                    {obj.what}
                  </p>

                  <div className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Kết quả: </span>
                      <span>{obj.outcome}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Phù hợp: </span>
                      <span>{obj.when}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Cần có: </span>
                      <span>{obj.needs}</span>
                    </div>
                  </div>

                  {/* Destinations / Sub-branches (Đặc biệt cho Engagement & Leads) */}
                  {obj.destinations.length > 1 && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Vị trí chuyển đổi (Chọn 1 nhánh):
                      </div>
                      <div className="space-y-1">
                        {obj.destinations.map((d) => {
                          const isDestActive = isSelected && (payload.destination || obj.destinations[0].id) === d.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                onChange({ objective: obj.id, destination: d.id });
                              }}
                              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                                isDestActive
                                  ? 'bg-blue-600 font-semibold text-white'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                              }`}
                            >
                              <span>{d.title}</span>
                              {isDestActive && <span>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Accordion "Tìm hiểu thêm" */}
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedObj(expandedObj === obj.id ? null : obj.id)}
                      className="text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      {expandedObj === obj.id ? 'Thu gọn chi tiết ▲' : 'Tìm hiểu thêm chi tiết ▼'}
                    </button>
                    {expandedObj === obj.id && (
                      <div className="mt-2 rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-600 space-y-1.5 dark:bg-slate-800 dark:text-slate-300">
                        <div>
                          <b>Meta tối ưu theo:</b> {obj.optimizes}
                        </div>
                        <div>
                          <b>Ví dụ thực tế:</b> <i>{obj.example}</i>
                        </div>
                        {obj.readiness.metaNote && (
                          <div className="text-amber-700 dark:text-amber-300 text-[10px]">
                            ⚡ {obj.readiness.metaNote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={!obj.enabled}
                    onClick={() => {
                      const dest = obj.destinations[0]?.id || 'WEBSITE';
                      onChange({ objective: obj.id, destination: dest });
                    }}
                    className={`w-full rounded-xl py-2 text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : obj.enabled
                          ? 'border border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                    }`}
                  >
                    {isSelected ? 'Đã chọn mục tiêu này' : obj.enabled ? 'Chọn mục tiêu này' : 'Chưa khả dụng'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Conversion Chain Summary (Chuỗi liên thông) */}
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 text-xs dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="font-bold text-blue-950 dark:text-blue-300 mb-2">
            🔗 Chuỗi liên thông kỹ thuật (Conversion Chain):
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <span className="text-slate-500">Mục tiêu chiến dịch:</span>
              <div className="font-bold text-slate-900 dark:text-slate-100">{currentObjMeta.title}</div>
            </div>
            <div>
              <span className="text-slate-500">Vị trí chuyển đổi:</span>
              <div className="font-bold text-slate-900 dark:text-slate-100">
                {currentObjMeta.destinations.find((d) => d.id === currentDestination)?.title || 'Trang web'}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Mục tiêu hiệu quả:</span>
              <div className="font-bold text-slate-900 dark:text-slate-100">{currentObjMeta.optimizes}</div>
            </div>
            <div>
              <span className="text-slate-500">CTA / Nút bấm:</span>
              <div className="font-bold text-slate-900 dark:text-slate-100">
                {currentObjMeta.destinations.find((d) => d.id === currentDestination)?.cta || 'Tìm hiểu thêm'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Section D · Cách thiết lập chiến dịch */}
      <section aria-label="Cách thiết lập chiến dịch" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
          D · Cách thiết lập chiến dịch (Setup Mode)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChange({ setup_mode: 'recommended' })}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              setupMode === 'recommended'
                ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Được đề xuất (Advantage+ / Recommended)</span>
              {setupMode === 'recommended' && <span className="text-blue-600 font-bold">✓</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Tận dụng thuật toán tự động hóa thông minh của Meta để tối ưu hóa phân phối và chi phí theo chuẩn Bosa Group.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChange({ setup_mode: 'manual' })}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              setupMode === 'manual'
                ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Tự thiết lập (Manual / Chuyên gia)</span>
              {setupMode === 'manual' && <span className="text-blue-600 font-bold">✓</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mở khóa bước «Cài đặt nâng cao» để tự chọn chi tiết vị trí hiển thị, chiến lược giá thầu Bid Cap / Cost Cap.
            </p>
          </button>
        </div>

        {setupMode === 'recommended' && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Giá trị Bosa Group đề xuất tự động:</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px] text-slate-600 dark:text-slate-400">
              <div>• Ngân sách: <b>Linh hoạt theo ngày</b></div>
              <div>• Vị trí: <b>Advantage+ Placements</b></div>
              <div>• Giá thầu: <b>Chi phí thấp nhất (Lowest Cost)</b></div>
              <div>• Theo dõi: <b>Pixel & UTM tự động</b></div>
            </div>
          </div>
        )}
      </section>

      {/* 8. Section E · Thử nghiệm A/B */}
      <section aria-label="Thử nghiệm A/B" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
          E · Thử nghiệm A/B (Split Testing)
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Kích hoạt kế hoạch thử nghiệm A/B
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              So sánh hai phương án đối chứng (A) và thử nghiệm (B), chỉ đổi MỘT biến số duy nhất (nội dung, đối tượng hoặc vị trí).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isAbEnabled}
            onClick={() => {
              onChange({
                ab_plan: {
                  enabled: !isAbEnabled,
                  variable: 'content',
                  splitRatio: 50,
                  metric: 'cpa',
                  variants: [],
                },
              });
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isAbEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isAbEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {isAbEnabled && (
          <p className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
            ✓ Đã bật thử nghiệm A/B: Hệ thống sẽ mở thêm bước «Thử nghiệm A/B» trong quy trình tạo chiến dịch.
          </p>
        )}
      </section>

      {/* 9. Tên chiến dịch */}
      <Field label="Tên chiến dịch" error={errors?.name} required>
        <div className="flex gap-2">
          <input
            type="text"
            value={payload.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ví dụ: BosaGroup-ADS-NhanDienThuongHieu-20261015"
            maxLength={120}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <button
            type="button"
            onClick={generateAutoName}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Dùng tên tự động
          </button>
        </div>
        <div className="mt-1 text-right text-xs text-slate-400">
          {(payload.name ?? '').length}/120 ký tự
        </div>
      </Field>

      {/* 10. Nền tảng quảng cáo */}
      <Field label="Nền tảng quảng cáo" error={errors?.platforms} required>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLATFORMS.map((p) => {
            const isSelected = selectedPlatforms.includes(p);
            const meta = PLATFORM_META[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`flex items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-white opacity-60 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <PlatformTag platform={p} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {meta.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p === 'facebook' ? 'Dark Post (R1-R7)' : 'Tự động đồng bộ'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </button>
            );
          })}
        </div>
      </Field>

      {/* 11. Hạng mục quảng cáo đặc biệt */}
      <Field label="Hạng mục quảng cáo đặc biệt (Meta Special Ad Category)">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={payload.specialCategory === 'HOUSING'}
              onChange={(e) => {
                const isHousing = e.target.checked;
                const cat: SpecialCategory = isHousing ? 'HOUSING' : 'NONE';
                const patch: Partial<CampaignDraftPayload> = { specialCategory: cat };
                if (isHousing && payload.audience) {
                  patch.audience = {
                    ...payload.audience,
                    ageMin: 18,
                    ageMax: 65,
                    genders: ['MALE', 'FEMALE'],
                  };
                }
                onChange(patch);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Chiến dịch thuộc lĩnh vực Nhà ở / Bất động sản (Housing)
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Theo chính sách Meta, các quảng cáo bán/cho thuê bất động sản, thế chấp hoặc dịch vụ liên quan bắt buộc phải khai báo hạng mục này. Độ tuổi sẽ được cố định 18–65 và nhắm tới tất cả giới tính để tuân thủ luật chống phân biệt đối xử.
              </div>
            </div>
          </label>
        </div>
      </Field>

      {/* Modal Sức khỏe tài khoản (Health Modal) */}
      {isHealthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                🩺 Sức khỏe tài khoản quảng cáo Meta
              </h3>
              <button type="button" onClick={() => setIsHealthOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2 dark:border-slate-800">
                <span className="text-slate-500">Mã tài khoản (Ad Account ID):</span>
                <span className="font-mono font-bold">{payload.accountId || 'act_1504039080130809'}</span>
              </div>
              <div className="flex justify-between border-b pb-2 dark:border-slate-800">
                <span className="text-slate-500">Kết nối Marketing API:</span>
                <span className="font-semibold text-emerald-600">✓ Sẵn sàng (Meta Graph API v23.0)</span>
              </div>
              <div className="flex justify-between border-b pb-2 dark:border-slate-800">
                <span className="text-slate-500">Chính sách quảng cáo Meta:</span>
                <span className="font-semibold text-emerald-600">✓ Tuân thủ (Không có cảnh báo vi phạm)</span>
              </div>
              <div className="flex justify-between border-b pb-2 dark:border-slate-800">
                <span className="text-slate-500">Hạn mức chi tiêu hàng ngày:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Không giới hạn</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-slate-500">Quyền quản trị Dark Post:</span>
                <span className="font-semibold text-emerald-600">✓ Đầy đủ (Trang phân phối R1–R7)</span>
              </div>
            </div>
            <div className="mt-5 text-right">
              <button
                type="button"
                onClick={() => setIsHealthOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Đổi tài khoản */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Đổi tài khoản quảng cáo
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Nhập mã tài khoản quảng cáo Meta (bắt đầu bằng act_):
            </p>
            <input
              type="text"
              value={tempAccountId}
              onChange={(e) => setTempAccountId(e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({ accountId: tempAccountId });
                  setIsAccountModalOpen(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
