import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createContainer } from '../src/container.js';
import { connectMongo } from '../src/db/mongo.js';
import { DEMO_PASSWORD, seedDatabase } from '../src/seed.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const DB_NAME = `adhub_draft_test_${process.pid}`;

async function isMongoReachable(): Promise<boolean> {
  const probe = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 1500 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.close();
  }
}

function createDummyPngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const mongoUp = await isMongoReachable();

describe.skipIf(!mongoUp)('Campaign Lifecycle & Dark Post API (R1 - R8)', () => {
  let client: MongoClient;
  let server: Server;
  let baseUrl: string;
  const tokens: Record<string, string> = {};

  async function call(path: string, options: { token?: string; method?: string; body?: unknown } = {}) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  }

  async function login(email: string, password = DEMO_PASSWORD) {
    return call('/auth/login', { method: 'POST', body: { email, password } });
  }

  beforeAll(async () => {
    const connection = await connectMongo(MONGODB_URI, DB_NAME);
    client = connection.client;
    const db = connection.db;
    await seedDatabase(db);
    server = createApp(createContainer(db, {})).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    for (const role of ['owner', 'buyer', 'client']) {
      const email = `${role}@adhub.vn`;
      const res = await login(email);
      expect(res.status).toBe(200);
      tokens[role] = res.body.token;
    }
  });

  afterAll(async () => {
    server?.close();
    if (client) {
      await client.db(DB_NAME).dropDatabase();
      await client.close();
    }
  });

  describe('T1: Media Asset Upload, Validation & Retrieval', () => {
    let uploadedImageId: string;

    it('uploads a valid PNG image (800x800) and returns metadata', async () => {
      const validPng = createDummyPngBuffer(800, 800);
      const res = await call('/media', {
        method: 'POST',
        token: tokens.buyer,
        body: {
          fileName: 'banner-sale.png',
          dataBase64: validPng.toString('base64'),
        },
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.fileName).toBe('banner-sale.png');
      expect(res.body.width).toBe(800);
      expect(res.body.height).toBe(800);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.sha256).toBeDefined();

      uploadedImageId = res.body.id;
    });

    it('deduplicates identical images by sha256', async () => {
      const validPng = createDummyPngBuffer(800, 800);
      const res = await call('/media', {
        method: 'POST',
        token: tokens.buyer,
        body: {
          fileName: 'banner-sale-copy.png',
          dataBase64: validPng.toString('base64'),
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(uploadedImageId);
    });

    it('rejects image smaller than 600x600', async () => {
      const smallPng = createDummyPngBuffer(400, 400);
      const res = await call('/media', {
        method: 'POST',
        token: tokens.buyer,
        body: {
          fileName: 'small.png',
          dataBase64: smallPng.toString('base64'),
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/kích thước tối thiểu là 600x600px/i);
    });

    it('rejects invalid or corrupted image bytes', async () => {
      const fakeImage = Buffer.from('this is not an image');
      const res = await call('/media', {
        method: 'POST',
        token: tokens.buyer,
        body: {
          fileName: 'fake.png',
          dataBase64: fakeImage.toString('base64'),
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/kiểm tra lại tệp/i);
    });

    it('retrieves binary image file by ID', async () => {
      const res = await fetch(`${baseUrl}/api/media/${uploadedImageId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBe(32);
    });
  });

  describe('T2: Meta Helpers (Pages & Locations)', () => {
    it('lists available Facebook Pages with advertising status', async () => {
      const res = await call('/meta/pages', {
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const firstPage = res.body[0];
      expect(firstPage).toHaveProperty('id');
      expect(firstPage).toHaveProperty('name');
      expect(firstPage).toHaveProperty('isAdvertisingAllowed');
    });

    it('searches Vietnam locations by keyword', async () => {
      const res = await call('/meta/locations?q=Hà', {
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((loc: any) => loc.name.includes('Hà'))).toBe(true);
    });

    it('checks Meta account health', async () => {
      const res = await call('/meta/account-health', {
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      expect(res.body.healthy).toBe(true);
    });
  });

  describe('T3: Draft Lifecycle - CRUD & Access Control', () => {
    let draftId: string;
    let imageId: string;

    beforeAll(async () => {
      const img = createDummyPngBuffer(1080, 1080);
      const imgRes = await call('/media', {
        method: 'POST',
        token: tokens.buyer,
        body: { fileName: 'post.png', dataBase64: img.toString('base64') },
      });
      imageId = imgRes.body.id;
    });

    it('buyer can create a draft with step 1', async () => {
      const res = await call('/campaign-drafts', {
        method: 'POST',
        token: tokens.buyer,
        body: {
          step: 1,
          payload: {
            name: 'Chiến dịch Bất Động Sản Q4',
            objective: 'leads',
            platforms: ['facebook'],
            specialCategory: 'HOUSING',
          },
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.state).toBe('DRAFT');
      expect(res.body.revision).toBe(1);
      expect(res.body.step).toBe(1);
      expect(res.body.payload.specialCategory).toBe('HOUSING');
      draftId = res.body.id;
    });

    it('client is forbidden from accessing campaign drafts', async () => {
      const listRes = await call('/campaign-drafts', {
        token: tokens.client,
      });
      expect(listRes.status).toBe(403);

      const getRes = await call(`/campaign-drafts/${draftId}`, {
        token: tokens.client,
      });
      expect(getRes.status).toBe(403);
    });

    it('buyer can update draft and increments revision', async () => {
      const res = await call(`/campaign-drafts/${draftId}`, {
        method: 'PUT',
        token: tokens.buyer,
        body: {
          revision: 1,
          step: 2,
          payload: {
            creative: {
              headline: 'Dự án căn hộ cao cấp ven sông',
              primaryText: 'Đăng ký ngay nhận ưu đãi 10%',
              landingUrl: 'https://batdongsan.vn/du-an-q4',
              imageId,
            },
            pages: [
              { id: 'mock_page_01', name: 'Trang Bất Động Sản Thủ Đô', hasInstagram: true },
            ],
            audience: {
              locations: [{ key: 'VN-HN', name: 'Hà Nội', type: 'region' }],
              ageMin: 18,
              ageMax: 65,
              genders: ['MALE', 'FEMALE'],
            },
            totalDailyBudget: 500_000,
            allocations: [{ platform: 'facebook', percentage: 100 }],
          },
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.revision).toBe(2);
      expect(res.body.step).toBe(2);
      expect(res.body.payload.creative.headline).toBe('Dự án căn hộ cao cấp ven sông');
      expect(res.body.payload.pages.length).toBe(1);
    });

    it('rejects stale update with HTTP 409 Conflict (Optimistic Concurrency)', async () => {
      // Trying to update with revision: 1 when current revision is 2
      const res = await call(`/campaign-drafts/${draftId}`, {
        method: 'PUT',
        token: tokens.buyer,
        body: {
          revision: 1,
          payload: { name: 'Tên sửa đè' },
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Nháp đã được sửa ở nơi khác/);
    });

    it('runs 4-level validation (check)', async () => {
      const res = await call(`/campaign-drafts/${draftId}/check`, {
        method: 'POST',
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);
      expect(res.body.every((lvl: any) => lvl.status === 'PASSED')).toBe(true);
    });

    it('reports failure when draft uses a blocked page', async () => {
      // Update draft with blocked page
      const updateRes = await call(`/campaign-drafts/${draftId}`, {
        method: 'PUT',
        token: tokens.buyer,
        body: {
          revision: 2,
          payload: {
            pages: [
              { id: 'mock_page_blocked', name: 'Trang Bị Hạn Chế Quảng Cáo', hasInstagram: false },
            ],
          },
        },
      });
      expect(updateRes.status).toBe(200);

      const res = await call(`/campaign-drafts/${draftId}/check`, {
        method: 'POST',
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      const adLevel = res.body.find((lvl: any) => lvl.level === 'AD' && lvl.pageId === 'mock_page_blocked');
      expect(adLevel).toBeDefined();
      expect(adLevel.status).toBe('FAILED');
      expect(adLevel.message).toMatch(/Trang Bị Hạn Chế Quảng Cáo/);

      // Restore to healthy page
      const restoreRes = await call(`/campaign-drafts/${draftId}`, {
        method: 'PUT',
        token: tokens.buyer,
        body: {
          revision: 3,
          payload: {
            pages: [
              { id: 'mock_page_01', name: 'Trang Bất Động Sản Thủ Đô', hasInstagram: true },
            ],
          },
        },
      });
      expect(restoreRes.status).toBe(200);
    });

    it('generates ad previews for all selected pages across placements', async () => {
      const res = await call(`/campaign-drafts/${draftId}/previews`, {
        method: 'POST',
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mock_page_01');
      const previews = res.body['mock_page_01'];
      expect(previews.length).toBeGreaterThanOrEqual(2);
      expect(previews.some((p: any) => p.placement === 'DESKTOP_FEED_STANDARD')).toBe(true);
    });

    it('submits draft: creates PAUSED campaign, links dark post ads and sets SUBMITTED', async () => {
      const res = await call(`/campaign-drafts/${draftId}/submit`, {
        method: 'POST',
        token: tokens.buyer,
      });

      expect(res.status).toBe(201);
      const campaign = res.body;
      expect(campaign.status).toBe('PAUSED'); // R2
      expect(campaign.platform).toBe('facebook');
      expect(campaign.draftId).toBe(draftId);
      expect(campaign.meta?.ads?.length).toBe(1);

      // Verify draft state changed to SUBMITTED
      const draftRes = await call(`/campaign-drafts/${draftId}`, {
        token: tokens.buyer,
      });
      expect(draftRes.body.state).toBe('SUBMITTED');
      expect(draftRes.body.submission.results.campaignId).toBe(campaign.id);

      // Cannot re-submit submitted draft
      const reSubmit = await call(`/campaign-drafts/${draftId}/submit`, {
        method: 'POST',
        token: tokens.buyer,
      });
      expect(reSubmit.status).toBe(409);

      // Cannot update submitted draft
      const reUpdate = await call(`/campaign-drafts/${draftId}`, {
        method: 'PUT',
        token: tokens.buyer,
        body: { revision: 4, payload: { name: 'Thử sửa' } },
      });
      expect(reUpdate.status).toBe(409);
    });
  });

  describe('T4: R3 Enforcement - Direct Activation Block on Facebook', () => {
    let fbCampaignId: string;
    let ttCampaignId: string;

    beforeAll(async () => {
      // List campaigns to find facebook and tiktok campaigns
      const res = await call('/campaigns', { token: tokens.owner });
      const fb = res.body.find((c: any) => c.platform === 'facebook');
      const tt = res.body.find((c: any) => c.platform === 'tiktok');
      expect(fb).toBeDefined();
      expect(tt).toBeDefined();
      fbCampaignId = fb.id;
      ttCampaignId = tt.id;
    });

    it('blocks activating a Facebook campaign via PATCH /campaigns/:id (R3)', async () => {
      const res = await call(`/campaigns/${fbCampaignId}`, {
        method: 'PATCH',
        token: tokens.owner,
        body: { status: 'ACTIVE' },
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACTIVATE_ON_META');
      expect(res.body.message).toMatch(/Meta Ads Manager/);
    });

    it('blocks activating Facebook campaigns via POST /campaigns/bulk-status (R3)', async () => {
      const res = await call('/campaigns/bulk-status', {
        method: 'POST',
        token: tokens.owner,
        body: {
          ids: [fbCampaignId],
          status: 'ACTIVE',
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(0);
      expect(res.body.errors.length).toBe(1);
      expect(res.body.errors[0].message).toMatch(/Meta Ads Manager/);
    });

    it('allows pausing a Facebook campaign via AdHub', async () => {
      const res = await call(`/campaigns/${fbCampaignId}`, {
        method: 'PATCH',
        token: tokens.owner,
        body: { status: 'PAUSED' },
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PAUSED');
    });

    it('allows activating TikTok campaign via AdHub normally (legacy behavior preserved)', async () => {
      const res = await call(`/campaigns/${ttCampaignId}`, {
        method: 'PATCH',
        token: tokens.owner,
        body: { status: 'ACTIVE' },
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
    });
  });

  describe('T5: Campaign Refresh Status & Clone to Draft', () => {
    let campaignId: string;

    beforeAll(async () => {
      const res = await call('/campaigns', { token: tokens.owner });
      campaignId = res.body[0].id;
    });

    it('refreshes campaign status from platform', async () => {
      const res = await call(`/campaigns/${campaignId}/refresh-status`, {
        method: 'POST',
        token: tokens.buyer,
      });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(campaignId);
    });

    it('clones campaign to a new draft in DRAFT state', async () => {
      const res = await call(`/campaigns/${campaignId}/clone-to-draft`, {
        method: 'POST',
        token: tokens.buyer,
      });

      expect(res.status).toBe(201);
      expect(res.body.state).toBe('DRAFT');
      expect(res.body.step).toBe(1);
      expect(res.body.payload.name).toMatch(/Bản sao/);
    });
  });
});

