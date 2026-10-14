import { randomUUID } from 'node:crypto';
import { simulateDailyMetrics } from './adapters/mock/mock-ad-platform.adapter.js';
import { PLATFORM_PROFILES } from './adapters/mock/platform-profiles.js';
import type { Db } from 'mongodb';
import { daysAgo } from './domain/dates.js';
import { hashPassword } from './domain/password.js';
import type { ActivityLog, Campaign, Creative, Integration, MetricDaily, Objective, Platform, Role, Rule, User } from './domain/types.js';
import { COLLECTIONS, type CollectionTypes } from './db/mongo.js';
import { SYSTEM_ACTOR } from './services/activity.service.js';

const SEED_DAYS = 30;

/** Deterministic PRNG so demo data is stable between runs. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which of the platform's demo ad accounts (see mockAdAccounts) the campaign runs in. */
type SeedAccount = 'demo' | 'scale' | 'test';

const SEED_CAMPAIGNS: {
  platform: Platform;
  name: string;
  objective: Objective;
  budget: number;
  account: SeedAccount;
  creative: Creative;
}[] = [
  {
    platform: 'facebook',
    name: 'FB - Sale cuối tuần',
    objective: 'sales',
    budget: 1_500_000,
    account: 'demo',
    creative: {
      headline: 'Ưu đãi cuối tuần – giảm đến 30%',
      primaryText: 'Chỉ 2 ngày cuối tuần: giảm đến 30% cho đơn đầu tiên. Đặt ngay hôm nay để giữ ưu đãi!',
      landingUrl: 'https://example.com/uu-dai-cuoi-tuan?utm_source=facebook&utm_medium=paid',
    },
  },
  {
    platform: 'facebook',
    name: 'FB - Thu lead tư vấn',
    objective: 'leads',
    budget: 800_000,
    account: 'scale',
    creative: {
      headline: 'Đăng ký tư vấn miễn phí',
      primaryText: 'Bạn cần giải pháp phù hợp? Để lại thông tin, chuyên viên sẽ gọi lại tư vấn trong hôm nay.',
      landingUrl: 'https://example.com/tu-van?utm_source=facebook&utm_medium=paid',
    },
  },
  {
    platform: 'facebook',
    name: 'FB - Retargeting giỏ hàng',
    objective: 'sales',
    budget: 500_000,
    account: 'demo',
    creative: {
      headline: 'Bạn còn sản phẩm trong giỏ hàng',
      primaryText: 'Hoàn tất đơn hàng hôm nay để nhận miễn phí vận chuyển. Ưu đãi chỉ dành cho bạn.',
      landingUrl: 'https://example.com/gio-hang?utm_source=facebook&utm_medium=retargeting',
    },
  },
  {
    platform: 'tiktok',
    name: 'TT - Video viral BST mới',
    objective: 'awareness',
    budget: 1_200_000,
    account: 'demo',
    creative: {
      headline: 'Bộ sưu tập mới đã lên kệ',
      primaryText: 'Xem ngay những điểm mới nhất mùa này 👀 #moinhat #xuhuong',
      landingUrl: 'https://example.com/bo-suu-tap-moi?utm_source=tiktok&utm_medium=paid',
    },
  },
  {
    platform: 'tiktok',
    name: 'TT - Livestream bán hàng',
    objective: 'sales',
    budget: 2_000_000,
    account: 'scale',
    creative: {
      headline: 'Livestream ưu đãi 20h tối nay',
      primaryText: 'Hẹn bạn 20h tối nay – deal giờ vàng, quà tặng cho 100 đơn đầu tiên!',
      landingUrl: 'https://example.com/livestream?utm_source=tiktok&utm_medium=paid',
    },
  },
  {
    platform: 'google',
    name: 'GG - Search thương hiệu',
    objective: 'traffic',
    budget: 600_000,
    account: 'demo',
    creative: {
      headline: 'Trang chính thức – Giao nhanh toàn quốc',
      primaryText: 'Chính hãng, đổi trả trong 7 ngày. Xem ưu đãi mới nhất trên trang chính thức.',
      landingUrl: 'https://example.com/?utm_source=google&utm_medium=cpc',
    },
  },
  {
    platform: 'google',
    name: 'GG - Performance Max',
    objective: 'sales',
    budget: 1_800_000,
    account: 'test',
    creative: {
      headline: 'Mua sắm trực tuyến – Ưu đãi hôm nay',
      primaryText: 'Hàng mới mỗi tuần, thanh toán linh hoạt, giao nhanh. Khám phá ngay!',
      landingUrl: 'https://example.com/san-pham?utm_source=google&utm_medium=pmax',
    },
  },
];

const SEED_RULES: Omit<Rule, 'id' | 'createdAt'>[] = [
  {
    name: 'Stop-loss: CPA quá cao',
    enabled: false,
    platform: 'all',
    condition: { metric: 'cpa', operator: 'gt', threshold: 150_000, lookbackDays: 3 },
    action: { type: 'pause' },
  },
  {
    name: 'Scale winner: ROAS tốt',
    enabled: false,
    platform: 'all',
    condition: { metric: 'roas', operator: 'gt', threshold: 4, lookbackDays: 7 },
    action: { type: 'increase_budget', value: 20 },
  },
];

/**
 * Local development and tests only. Anything reachable outside localhost must seed with
 * per-role passwords (SEED_PASSWORD_* in server/.env), which production startup enforces.
 */
export const DEMO_PASSWORD = 'adhub@123';

/** One password per demo account; missing roles fall back to DEMO_PASSWORD. */
export type SeedPasswords = Partial<Record<Role, string>>;

export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: 'owner@adhub.vn', name: 'Nguyễn Minh Chủ', role: 'owner' },
  { email: 'buyer@adhub.vn', name: 'Lê Media Buyer', role: 'media_buyer' },
  { email: 'client@adhub.vn', name: 'Bosa Fashion (Khách hàng)', role: 'client' },
];

async function buildDemoUsers(now: string, passwords: SeedPasswords = {}): Promise<User[]> {
  // Hash each distinct password once; accounts sharing the fallback share its hash.
  const hashes = new Map<string, string>();
  const hashFor = async (password: string) => {
    if (!hashes.has(password)) hashes.set(password, await hashPassword(password));
    return hashes.get(password)!;
  };
  return Promise.all(
    DEMO_USERS.map(async (user) => ({
      ...user,
      id: randomUUID(),
      active: true,
      passwordHash: await hashFor(passwords[user.role] ?? DEMO_PASSWORD),
      createdAt: now,
    })),
  );
}

const isEmpty = async (db: Db, name: string) => (await db.collection(name).countDocuments()) === 0;

/**
 * Seeds only what is missing, so databases created before user accounts existed
 * get the demo users without losing their campaign data.
 */
export async function seedIfEmpty(db: Db, passwords: SeedPasswords = {}): Promise<string | null> {
  if (await isEmpty(db, COLLECTIONS.integrations)) {
    await seedDatabase(db, passwords);
    return 'Database empty — seeded demo data and accounts';
  }
  if (await isEmpty(db, COLLECTIONS.users)) {
    await db.collection(COLLECTIONS.users).insertMany(await buildDemoUsers(new Date().toISOString(), passwords));
    return 'No users found — seeded demo accounts';
  }
  return null;
}

/** Resets all collections with demo data (until real platform APIs are approved). */
export async function seedDatabase(db: Db, passwords: SeedPasswords = {}): Promise<void> {
  const random = mulberry32(42);
  const now = new Date().toISOString();

  const integrations: Integration[] = (Object.keys(PLATFORM_PROFILES) as Platform[]).map((platform) => ({
    platform,
    connected: true,
    accountId: `${PLATFORM_PROFILES[platform].externalIdPrefix}-act-demo`,
    accountName: `${PLATFORM_PROFILES[platform].displayName} - Bosa Demo`,
    connectedAt: now,
  }));

  const campaigns: Campaign[] = SEED_CAMPAIGNS.map((seed) => {
    const profile = PLATFORM_PROFILES[seed.platform];
    return {
      id: randomUUID(),
      platform: seed.platform,
      externalId: `${profile.externalIdPrefix}-${randomUUID().slice(0, 12)}`,
      name: seed.name,
      objective: seed.objective,
      platformObjective: profile.objectiveMap[seed.objective],
      status: 'ACTIVE',
      dailyBudget: seed.budget,
      creative: seed.creative,
      accountId: `${profile.externalIdPrefix}-act-${seed.account}`,
      createdAt: now,
    };
  });

  const metrics: MetricDaily[] = campaigns.flatMap((campaign) =>
    Array.from({ length: SEED_DAYS }, (_, day) =>
      simulateDailyMetrics(
        PLATFORM_PROFILES[campaign.platform],
        campaign.id,
        campaign.dailyBudget,
        daysAgo(day),
        random,
      ),
    ),
  );

  const rules: Rule[] = SEED_RULES.map((rule) => ({ ...rule, id: randomUUID(), createdAt: now }));

  const activities: ActivityLog[] = [
    {
      id: randomUUID(),
      actor: SYSTEM_ACTOR.type,
      actorName: SYSTEM_ACTOR.name,
      message: `Khởi tạo dữ liệu demo: ${campaigns.length} chiến dịch, ${DEMO_USERS.length} tài khoản`,
      createdAt: now,
    },
  ];

  const data: { [K in keyof CollectionTypes]: CollectionTypes[K][] } = {
    integrations,
    campaigns,
    metrics,
    rules,
    activities,
    users: await buildDemoUsers(now, passwords),
    sessions: [],
    settings: [],
    notifications: [],
    campaign_drafts: [],
    media: [],
  };
  for (const [name, docs] of Object.entries(data)) {
    const collection = db.collection(name);
    await collection.deleteMany({});
    if (docs.length > 0) await collection.insertMany(docs.map((doc) => ({ ...doc })));
  }
}
