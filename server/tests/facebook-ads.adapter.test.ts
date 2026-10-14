import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FacebookAdsAdapter, toDailyMetrics } from '../src/adapters/meta/facebook-ads.adapter.js';
import type { MetaConfig } from '../src/config/env.js';
import type { Campaign } from '../src/domain/types.js';

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

/** Records every Graph API call and answers from a path → response table. */
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

const input = {
  name: 'Sale 10.10',
  objective: 'traffic' as const,
  dailyBudget: 100_000,
  creative: { headline: 'Giảm 50%', primaryText: 'Chỉ hôm nay', landingUrl: 'https://shop.vn' },
};

/** The Page hands out its own token, and the ad's post is created on its feed. */
const PAGE = {
  'GET 222': { access_token: 'PAGE-token-0123456789' },
  'POST 222/feed': { id: '222_777' },
};

describe('FacebookAdsAdapter', () => {
  it('builds campaign → ad set → hidden Page post → creative → ad, with the budget on a paused campaign', async () => {
    const { http, calls } = fakeGraph({
      ...PAGE,
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { id: '9002' },
      'POST act_111/adcreatives': { id: '9003' },
      'POST act_111/ads': { id: '9004' },
    });
    const result = await new FacebookAdsAdapter(CONFIG, http).createCampaign(input);

    expect(result).toEqual({ externalId: '9001', platformObjective: 'OUTCOME_TRAFFIC' });
    expect(calls.map((c) => c.path)).toEqual([
      'act_111/campaigns',
      'act_111/adsets',
      '222',
      '222/feed',
      'act_111/adcreatives',
      'act_111/ads',
    ]);
    const [campaign, adSet, , post, creative, ad] = calls.map((c) => c.params);
    expect(campaign).toMatchObject({ status: 'PAUSED', daily_budget: '100000', objective: 'OUTCOME_TRAFFIC' });
    expect(adSet).toMatchObject({ campaign_id: '9001', optimization_goal: 'LINK_CLICKS' });
    expect(adSet).not.toHaveProperty('promoted_object');
    expect(post).toMatchObject({
      access_token: 'PAGE-token-0123456789',
      published: 'false',
      link: 'https://shop.vn',
      message: 'Giảm 50%\n\nChỉ hôm nay',
    });
    // Overriding the link title is reserved for verified domain owners (Meta error #100).
    expect(post).not.toHaveProperty('name');
    expect(creative).toMatchObject({ object_story_id: '222_777' });
    expect(creative).not.toHaveProperty('object_story_spec');
    expect(ad).toMatchObject({ adset_id: '9002', creative: JSON.stringify({ creative_id: '9003' }) });
  });

  it('publishes the hidden ad post on the Page before switching the campaign on', async () => {
    const { http, calls } = fakeGraph({
      'GET 9001/ads': { data: [{ creative: { effective_object_story_id: '222_777' } }] },
      'GET 222': PAGE['GET 222'],
      'GET 222_777': { is_published: false },
    });
    await new FacebookAdsAdapter(CONFIG, http).updateStatus('9001', 'ACTIVE');

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET 9001/ads',
      'GET 222',
      'GET 222_777',
      'POST 222_777',
      'POST 9001',
    ]);
    expect(calls[3].params).toMatchObject({ access_token: 'PAGE-token-0123456789', is_published: 'true' });
    expect(calls[4].params).toMatchObject({ status: 'ACTIVE' });
  });

  /** A campaign whose one ad uses Page post 222_777 in the given state. */
  const withPost = (post: { is_published: boolean; is_hidden: boolean }, extra: Record<string, unknown> = {}) =>
    fakeGraph({
      'GET 9001/ads': { data: [{ creative: { effective_object_story_id: '222_777' } }] },
      'GET 222': PAGE['GET 222'],
      'GET 222_777': post,
      ...extra,
    });
  const postWrites = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.path === '222_777').map((c) => c.params);

  it('leaves a post already on the timeline alone when switching on', async () => {
    const { http, calls } = withPost({ is_published: true, is_hidden: false });
    await new FacebookAdsAdapter(CONFIG, http).updateStatus('9001', 'ACTIVE');
    expect(postWrites(calls)).toEqual([]);
  });

  it('hides the post from the Page after pausing, and shows it again when switched back on', async () => {
    const paused = withPost({ is_published: true, is_hidden: false });
    await new FacebookAdsAdapter(CONFIG, paused.http).updateStatus('9001', 'PAUSED');
    expect(paused.calls[0]).toMatchObject({ method: 'POST', path: '9001', params: { status: 'PAUSED' } });
    expect(postWrites(paused.calls)).toEqual([expect.objectContaining({ is_hidden: 'true' })]);

    const resumed = withPost({ is_published: true, is_hidden: true });
    await new FacebookAdsAdapter(CONFIG, resumed.http).updateStatus('9001', 'ACTIVE');
    expect(postWrites(resumed.calls)).toEqual([expect.objectContaining({ is_hidden: 'false' })]);
    expect(resumed.calls.at(-1)).toMatchObject({ method: 'POST', path: '9001', params: { status: 'ACTIVE' } });
  });

  it('does not touch a post that was never published when pausing', async () => {
    const { http, calls } = withPost({ is_published: false, is_hidden: false });
    await new FacebookAdsAdapter(CONFIG, http).updateStatus('9001', 'PAUSED');
    expect(postWrites(calls)).toEqual([]);
  });

  it('still pauses the campaign and says so when the post cannot be hidden', async () => {
    const { http, calls } = withPost(
      { is_published: true, is_hidden: false },
      { 'POST 222_777': { error: { code: 200, message: 'Permissions error' } } },
    );
    await expect(new FacebookAdsAdapter(CONFIG, http).updateStatus('9001', 'PAUSED')).rejects.toThrow(
      /Đã dừng chiến dịch trên Meta nhưng chưa ẩn được bài/,
    );
    expect(calls[0]).toMatchObject({ method: 'POST', path: '9001', params: { status: 'PAUSED' } });
  });

  it('explains a token that cannot manage the Page', async () => {
    const { http } = fakeGraph({ 'POST act_111/campaigns': { id: '9001' }, 'GET 222': { id: '222' } });
    await expect(new FacebookAdsAdapter(CONFIG, http).createCampaign(input)).rejects.toThrow(/pages_manage_posts/);
  });

  it('signs every call with appsecret_proof', async () => {
    const { http, calls } = fakeGraph({});
    await new FacebookAdsAdapter(CONFIG, http).updateStatus('9001', 'PAUSED');
    const proof = createHmac('sha256', CONFIG.appSecret).update(CONFIG.accessToken).digest('hex');
    expect(calls[0].params).toMatchObject({ appsecret_proof: proof, status: 'PAUSED' });
  });

  it('tracks the pixel purchase event for sales campaigns', async () => {
    const { http, calls } = fakeGraph({ ...PAGE, 'POST act_111/campaigns': { id: '1' }, 'POST act_111/adsets': { id: '2' } });
    await new FacebookAdsAdapter(CONFIG, http).createCampaign({ ...input, objective: 'sales' });
    expect(JSON.parse(calls[1].params.promoted_object)).toEqual({ pixel_id: '333', custom_event_type: 'PURCHASE' });
  });

  it('refuses sales campaigns without a pixel before calling Meta', async () => {
    const { http, calls } = fakeGraph({});
    const adapter = new FacebookAdsAdapter({ ...CONFIG, pixelId: undefined }, http);
    await expect(adapter.createCampaign({ ...input, objective: 'sales' })).rejects.toThrow(/META_PIXEL_ID/);
    expect(calls).toHaveLength(0);
  });

  it('deletes the half-built campaign and surfaces Meta’s message when a later step fails', async () => {
    const { http, calls } = fakeGraph({
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { error: { code: 100, error_user_title: 'Ngân sách quá thấp', error_user_msg: 'Tăng ngân sách' } },
    });
    await expect(new FacebookAdsAdapter(CONFIG, http).createCampaign(input)).rejects.toThrow(
      'Ngân sách quá thấp: Tăng ngân sách',
    );
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '9001' });
  });

  it('also deletes the hidden Page post when the ad cannot be built', async () => {
    const { http, calls } = fakeGraph({
      ...PAGE,
      'POST act_111/campaigns': { id: '9001' },
      'POST act_111/adsets': { id: '9002' },
      'POST act_111/adcreatives': { error: { code: 100, message: 'Invalid creative' } },
    });
    await expect(new FacebookAdsAdapter(CONFIG, http).createCampaign(input)).rejects.toThrow('Invalid creative');
    expect(calls.slice(-2)).toEqual([
      expect.objectContaining({ method: 'DELETE', path: '222_777' }),
      expect.objectContaining({ method: 'DELETE', path: '9001' }),
    ]);
  });

  it('explains expired tokens', async () => {
    const { http } = fakeGraph({ 'POST 9001': { error: { code: 190, message: 'Session has expired' } } });
    await expect(new FacebookAdsAdapter(CONFIG, http).updateBudget('9001', 50_000)).rejects.toThrow(/Token Meta hết hạn/);
  });

  it('rejects demo campaigns that only exist in the mock', async () => {
    const { http, calls } = fakeGraph({});
    await expect(new FacebookAdsAdapter(CONFIG, http).updateStatus('fb-1a2b3c', 'PAUSED')).rejects.toThrow(/không tồn tại trên Meta/);
    expect(calls).toHaveLength(0);
  });

  it('deletes real campaigns and skips demo ones', async () => {
    const { http, calls } = fakeGraph({});
    const adapter = new FacebookAdsAdapter(CONFIG, http);
    await adapter.deleteCampaign('fb-1a2b3c');
    await adapter.deleteCampaign('9001');
    expect(calls).toEqual([expect.objectContaining({ method: 'DELETE', path: '9001' })]);
  });

  it('checks the ad account is active and in VND when connecting', async () => {
    const usd = fakeGraph({ 'GET act_111': { name: 'Shop', currency: 'USD', account_status: 1 } });
    await expect(new FacebookAdsAdapter(CONFIG, usd.http).authorize()).rejects.toThrow(/VND/);

    const ok = fakeGraph({ 'GET act_111': { name: 'Shop', currency: 'VND', account_status: 1 } });
    await expect(new FacebookAdsAdapter(CONFIG, ok.http).authorize()).resolves.toEqual({
      accountId: 'act_111',
      accountName: 'Shop',
    });
  });

  it('lists the VND ad accounts with their spending limits', async () => {
    const { http } = fakeGraph({
      'GET me/adaccounts': {
        data: [
          { id: 'act_111', name: 'Chính', account_status: 1, currency: 'VND', amount_spent: '5000000', spend_cap: '0' },
          { id: 'act_222', name: 'Phụ', account_status: 2, currency: 'VND', amount_spent: '100', spend_cap: '900000' },
          { id: 'act_333', name: 'USD', account_status: 1, currency: 'USD' },
        ],
      },
    });
    await expect(new FacebookAdsAdapter(CONFIG, http).listAdAccounts()).resolves.toEqual([
      { id: 'act_111', name: 'Chính', active: true, spendCap: null, amountSpent: 5_000_000 },
      { id: 'act_222', name: 'Phụ', active: false, spendCap: 900_000, amountSpent: 100 },
    ]);
  });

  it('creates the campaign in the ad account it is given', async () => {
    const { http, calls } = fakeGraph({ ...PAGE, 'POST act_222/campaigns': { id: '1' }, 'POST act_222/adsets': { id: '2' } });
    await new FacebookAdsAdapter(CONFIG, http).createCampaign({ ...input, accountId: 'act_222' });
    const adCalls = calls.filter((c) => !c.path.startsWith('222'));
    expect(adCalls.every((c) => c.path.startsWith('act_222/'))).toBe(true);
  });

  it('reads one day of insights for the campaign', async () => {
    const { http, calls } = fakeGraph({ 'GET 9001/insights': { data: [] } });
    const campaign = { id: 'c1', externalId: '9001', objective: 'traffic' } as Campaign;
    const metrics = await new FacebookAdsAdapter(CONFIG, http).fetchDailyMetrics(campaign, '2026-10-09');
    expect(JSON.parse(calls[0].params.time_range)).toEqual({ since: '2026-10-09', until: '2026-10-09' });
    expect(metrics).toEqual({ campaignId: 'c1', date: '2026-10-09', spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
  });
});

describe('toDailyMetrics', () => {
  it('counts pixel purchases and revenue for sales campaigns', () => {
    const campaign = { id: 'c1', objective: 'sales' } as Campaign;
    const metrics = toDailyMetrics(campaign, '2026-10-09', {
      spend: '125000.4',
      impressions: '5400',
      inline_link_clicks: '87',
      actions: [
        { action_type: 'link_click', value: '87' },
        { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
        { action_type: 'omni_purchase', value: '4' },
      ],
      action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '1350000.5' }],
    });
    expect(metrics).toEqual({
      campaignId: 'c1',
      date: '2026-10-09',
      spend: 125_000,
      impressions: 5400,
      clicks: 87,
      conversions: 3,
      revenue: 1_350_001,
    });
  });

  it('reports no conversions for traffic campaigns', () => {
    const campaign = { id: 'c1', objective: 'traffic' } as Campaign;
    const metrics = toDailyMetrics(campaign, '2026-10-09', { actions: [{ action_type: 'purchase', value: '9' }] });
    expect(metrics.conversions).toBe(0);
  });
});
