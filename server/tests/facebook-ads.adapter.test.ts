import { describe, expect, it } from 'vitest';
import { FacebookAdsAdapter } from '../src/adapters/meta/facebook-ads.adapter.js';
import type { MetaConfig } from '../src/config/env.js';
import { AppError } from '../src/domain/errors.js';

const CONFIG: MetaConfig = {
  accessToken: 'EAAtest-token-0123456789',
  appSecret: 'app-secret-0123456789',
  adAccountId: 'act_111',
  pageId: '222',
  pixelId: '333',
  apiVersion: 'v23.0',
};

interface Call {
  method: string;
  path: string;
  params: Record<string, string>;
}

function fakeGraph(responses: Record<string, unknown | ((call: Call) => unknown)>) {
  const calls: Call[] = [];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const params = Object.fromEntries(method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body)));
    const call = { method, path: url.pathname.replace('/v23.0/', ''), params };
    calls.push(call);
    const entry = responses[`${method} ${call.path}`];
    const body = typeof entry === 'function' ? entry(call) : (entry ?? { success: true });
    const status = (body as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { http, calls };
}

describe('FacebookAdsAdapter - Campaign Lifecycle & Rules R1-R7', () => {
  it('R1 & R2: creates dark post campaign (PAUSED), adset (ACTIVE), ads (ACTIVE), never calling feed/post APIs', async () => {
    const { http, calls } = fakeGraph({
      'POST act_111/adimages': { images: { 'banner.jpg': { hash: 'hash_abc123' } } },
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { id: '9002' },
      'POST act_111/adcreatives': (call: Call) => ({ id: `creative_${call.params.name?.slice(-6)}` }),
      'POST act_111/ads': (call: Call) => ({ id: `ad_${call.params.name?.slice(-6)}` }),
      'GET 9001': {
        id: '9001',
        name: 'Chiến Dịch Mùa Thu [AH-tag123]',
        status: 'PAUSED',
        adsets: { data: [{ id: '9002', start_time: '2026-10-15T00:00:00Z', end_time: '2026-10-25T00:00:00Z' }] },
        ads: {
          data: [
            { id: 'ad_page1', name: 'Ad Page 1', status: 'ACTIVE', creative: { object_story_spec: { page_id: 'page_1' } } },
            { id: 'ad_page2', name: 'Ad Page 2', status: 'ACTIVE', creative: { object_story_spec: { page_id: 'page_2' } } },
          ],
        },
      },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    const result = await adapter.createCampaign({
      name: 'Chiến Dịch Mùa Thu',
      objective: 'traffic',
      dailyBudget: 100_000,
      creative: { headline: 'Ưu Đãi Lớn', primaryText: 'Nhanh tay kẻo lỡ', landingUrl: 'https://shop.vn', cta: 'SHOP_NOW' },
      pages: [
        { id: 'page_1', name: 'Fanpage Chính' },
        { id: 'page_2', name: 'Fanpage Phụ' },
      ],
      idempotencyTag: 'tag123',
      image: {
        id: 'img-1',
        buffer: Buffer.from('dummy image content'),
        fileName: 'banner.jpg',
        mimeType: 'image/jpeg',
      },
      schedule: {
        startTime: '2026-10-15T00:00:00Z',
        endTime: '2026-10-25T00:00:00Z',
      },
      audience: {
        locations: [{ key: '3824', name: 'Hà Nội', type: 'region' }],
        ageMin: 22,
        ageMax: 45,
        genders: ['MALE'],
      },
    });

    expect(result.externalId).toBe('9001');
    expect(result.meta?.ads).toHaveLength(2);

    // Rule R1: NO feed, photos, videos calls, NO is_published, NO timeline_visibility
    for (const call of calls) {
      expect(call.path).not.toContain('/feed');
      expect(call.path).not.toContain('/photos');
      expect(call.path).not.toContain('/videos');
      expect(call.params).not.toHaveProperty('is_published');
      expect(call.params).not.toHaveProperty('timeline_visibility');
    }

    // Rule R2: Campaign created as PAUSED, Adset and Ads created as ACTIVE
    const campaignCall = calls.find((c) => c.path === 'act_111/campaigns');
    expect(campaignCall?.params.status).toBe('PAUSED');
    expect(campaignCall?.params.name).toContain('[AH-tag123]');

    const adsetCall = calls.find((c) => c.path === 'act_111/adsets');
    expect(adsetCall?.params.status).toBe('ACTIVE');
    expect(adsetCall?.params.daily_budget).toBe('100000');
    expect(adsetCall?.params.start_time).toBe('2026-10-15T00:00:00Z');

    const creativeCalls = calls.filter((c) => c.path === 'act_111/adcreatives');
    expect(creativeCalls).toHaveLength(2);
    for (const cc of creativeCalls) {
      expect(cc.params.object_story_spec).toBeDefined();
      const spec = JSON.parse(cc.params.object_story_spec);
      expect(spec.link_data.image_hash).toBe('hash_abc123');
      expect(spec.link_data.call_to_action.type).toBe('SHOP_NOW');
    }

    const adCalls = calls.filter((c) => c.path === 'act_111/ads');
    expect(adCalls).toHaveLength(2);
    for (const ac of adCalls) {
      expect(ac.params.status).toBe('ACTIVE');
    }
  });

  it('R6: rolls back (deletes created campaign) when a subsequent page fails, including page name in error', async () => {
    let deletedCampaignId: string | null = null;
    let creativeCallCount = 0;

    const { http } = fakeGraph({
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { id: '9002' },
      'POST act_111/adcreatives': () => {
        creativeCallCount++;
        if (creativeCallCount === 2) {
          return { error: { code: 100, error_subcode: 1885316, message: 'Page restricted' } };
        }
        return { id: 'creative_1' };
      },
      'POST act_111/ads': { id: 'ad_1' },
      'DELETE 9001': (call: Call) => {
        deletedCampaignId = call.path;
        return { success: true };
      },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);

    await expect(
      adapter.createCampaign({
        name: 'Chiến Dịch Lỗi Trang 2',
        objective: 'traffic',
        dailyBudget: 50_000,
        creative: { headline: 'H', primaryText: 'T', landingUrl: 'https://shop.vn' },
        pages: [
          { id: 'page_ok', name: 'Trang Tốt' },
          { id: 'page_restricted', name: 'Trang Bị Chặn' },
        ],
      }),
    ).rejects.toThrow(/Trang Bị Chặn/);

    expect(deletedCampaignId).toBe('9001');
  });

  it('R6: throws NEEDS_RECONCILE when rollback delete also fails', async () => {
    const { http } = fakeGraph({
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { id: '9002' },
      'POST act_111/adcreatives': { error: { code: 100, message: 'Creative creation failed' } },
      'DELETE 9001': { error: { code: 500, message: 'Network timeout on delete' } },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);

    const err = await adapter
      .createCampaign({
        name: 'Rollback Fail Test',
        objective: 'traffic',
        dailyBudget: 50_000,
        creative: { headline: 'H', primaryText: 'T', landingUrl: 'https://shop.vn' },
        pages: [{ id: 'p1', name: 'P1' }],
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('NEEDS_RECONCILE');
    expect(err.message).toContain('không thể rollback');
  });

  it('R7: throws META_READBACK_MISMATCH if readBack fails to match created campaign state', async () => {
    const { http } = fakeGraph({
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { id: '9002' },
      'POST act_111/adcreatives': { id: 'c1' },
      'POST act_111/ads': { id: 'a1' },
      'GET 9001': {
        id: '9001',
        name: 'Test',
        status: 'ACTIVE', // Mismatch! Should be PAUSED
        ads: { data: [] },
      },
      'DELETE 9001': { success: true },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);

    await expect(
      adapter.createCampaign({
        name: 'Readback Mismatch Test',
        objective: 'traffic',
        dailyBudget: 50_000,
        creative: { headline: 'H', primaryText: 'T', landingUrl: 'https://shop.vn' },
        pages: [{ id: 'p1', name: 'P1' }],
      }),
    ).rejects.toThrow(/không khớp/);
  });

  it('R4: validateCampaign uses execution_options=["validate_only"] in all 4 levels', async () => {
    const { http, calls } = fakeGraph({
      'POST act_111/campaigns': { success: true },
      'POST act_111/adsets': { success: true },
      'POST act_111/adcreatives': { success: true },
      'POST act_111/ads': { success: true },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    const results = await adapter.validateCampaign({
      name: 'Validate Test',
      objective: 'traffic',
      dailyBudget: 50_000,
      creative: { headline: 'H', primaryText: 'T', landingUrl: 'https://shop.vn' },
      pages: [{ id: 'p1', name: 'Page 1' }],
    });

    expect(results.every((r) => r.status === 'PASSED')).toBe(true);
    for (const call of calls) {
      expect(call.params.execution_options).toBe('["validate_only"]');
    }
  });

  it('R4: previewAd requests generatepreviews and returns iframe html', async () => {
    const { http, calls } = fakeGraph({
      'GET act_111/generatepreviews': {
        data: [{ body: '<iframe src="https://facebook.com/preview"></iframe>' }],
      },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    const preview = await adapter.previewAd({
      pageId: '222',
      creative: { headline: 'H', primaryText: 'T', landingUrl: 'https://shop.vn' },
      adFormat: 'MOBILE_FEED_STANDARD',
    });

    expect(preview.iframeHtml).toContain('<iframe src="https://facebook.com/preview"></iframe>');
    expect(calls[0].params.ad_format).toBe('MOBILE_FEED_STANDARD');
  });

  it('R5: findByTag searches campaigns by tag', async () => {
    const { http } = fakeGraph({
      'GET act_111/campaigns': {
        data: [
          { id: '1001', name: 'Old Campaign', status: 'PAUSED' },
          { id: '1002', name: 'Campaign [AH-testtag99]', status: 'PAUSED' },
        ],
      },
      'GET 1002/ads': {
        data: [{ id: 'ad-1' }, { id: 'ad-2' }],
      },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    const found = await adapter.findByTag('testtag99');

    expect(found).toEqual({
      campaignId: '1002',
      status: 'PAUSED',
      adCount: 2,
    });
  });

  it('fetchStatuses maps active, paused, review status, and deleted on meta', async () => {
    const { http } = fakeGraph({
      'GET ': {
        '1001': {
          id: '1001',
          name: 'Camp 1',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          daily_budget: '50000',
          ads: { data: [{ id: 'a1', effective_status: 'ACTIVE' }] },
        },
        '1002': {
          id: '1002',
          name: 'Camp 2',
          status: 'ARCHIVED',
          effective_status: 'ARCHIVED',
        },
      },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    const statuses = await adapter.fetchStatuses(['1001', '1002', '1003']);

    expect(statuses['1001']).toMatchObject({ status: 'ACTIVE', effectiveStatus: 'ACTIVE', deletedOnMeta: false });
    expect(statuses['1002']).toMatchObject({ status: 'PAUSED', deletedOnMeta: true });
    expect(statuses['1003']).toMatchObject({ deletedOnMeta: true });
  });

  it('updateStatus only modifies campaign object (R1)', async () => {
    const { http, calls } = fakeGraph({
      'POST 9001': { success: true },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    await adapter.updateStatus('9001', 'PAUSED');

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('9001');
    expect(calls[0].params.status).toBe('PAUSED');
  });

  it('accountHealth detects active VND account vs spend cap and currency issues', async () => {
    const { http } = fakeGraph({
      'GET act_111': {
        name: 'Ad Account 1',
        currency: 'VND',
        account_status: 1,
        spend_cap: '10000000',
        amount_spent: '10000000', // Cap reached
        balance: '0',
      },
    });

    const adapter = new FacebookAdsAdapter(CONFIG, http);
    const health = await adapter.accountHealth();

    expect(health.healthy).toBe(false);
    expect(health.spendCapReached).toBe(true);
    expect(health.reasons).toContain('Tài khoản đã chạm ngưỡng chi tiêu tối đa (Spend Cap)');
  });
});
