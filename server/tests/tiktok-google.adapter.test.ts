import { describe, expect, it } from 'vitest';
import { GoogleAdsAdapter, toGoogleDailyMetrics } from '../src/adapters/google/google-ads.adapter.js';
import { TikTokAdsAdapter, toTikTokDailyMetrics } from '../src/adapters/tiktok/tiktok-ads.adapter.js';
import { loadGoogleAdsConfig, loadTikTokConfig, type GoogleAdsConfig, type TikTokConfig } from '../src/config/env.js';
import type { Campaign } from '../src/domain/types.js';

interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

/** Records every request and answers from a "METHOD pathname" → response table. */
function fakeHttp(responses: Record<string, unknown | ((call: Call) => unknown)>, status = 200) {
  const calls: Call[] = [];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const raw = init?.body;
    const body = raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw ? JSON.parse(String(raw)) : undefined;
    const call = { method, url, headers: (init?.headers ?? {}) as Record<string, string>, body };
    calls.push(call);
    const entry = responses[`${method} ${url.pathname}`];
    const answer = typeof entry === 'function' ? entry(call) : entry;
    return new Response(JSON.stringify(answer ?? {}), { status });
  }) as typeof fetch;
  return { http, calls };
}

const input = {
  name: 'Sale 10.10',
  objective: 'traffic' as const,
  dailyBudget: 100_000,
  creative: { headline: 'Giảm 50%', primaryText: 'Chỉ hôm nay', landingUrl: 'https://shop.vn' },
};

const TIKTOK: TikTokConfig = { accessToken: 'tt-token-0123456789abcdef', advertiserId: '700', apiBase: 'https://tt.test/open_api/v1.3' };
const ok = (data: unknown) => ({ code: 0, message: 'OK', data });

describe('TikTokAdsAdapter', () => {
  it('creates a disabled campaign with a daily budget, sending the access token header', async () => {
    const { http, calls } = fakeHttp({ 'POST /open_api/v1.3/campaign/create/': ok({ campaign_id: '1801' }) });
    const result = await new TikTokAdsAdapter(TIKTOK, http).createCampaign(input);
    expect(result).toEqual({ externalId: '1801', platformObjective: 'TRAFFIC' });
    expect(calls[0].headers['Access-Token']).toBe(TIKTOK.accessToken);
    expect(calls[0].body).toMatchObject({
      advertiser_id: '700',
      objective_type: 'TRAFFIC',
      budget_mode: 'BUDGET_MODE_DAY',
      budget: 100_000,
      operation_status: 'DISABLE',
    });
  });

  it('switches status and budget on the campaign', async () => {
    const { http, calls } = fakeHttp({
      'POST /open_api/v1.3/campaign/status/update/': ok({}),
      'POST /open_api/v1.3/campaign/update/': ok({}),
    });
    const adapter = new TikTokAdsAdapter(TIKTOK, http);
    await adapter.updateStatus('1801', 'ACTIVE');
    await adapter.updateBudget('1801', 80_000);
    expect(calls[0].body).toEqual({ advertiser_id: '700', campaign_ids: ['1801'], operation_status: 'ENABLE' });
    expect(calls[1].body).toEqual({ advertiser_id: '700', campaign_id: '1801', budget: 80_000 });
  });

  it('turns a non-zero code into a readable error, with a hint for expired tokens', async () => {
    const { http } = fakeHttp({ 'POST /open_api/v1.3/campaign/update/': { code: 40105, message: 'Access token is expired' } });
    await expect(new TikTokAdsAdapter(TIKTOK, http).updateBudget('1801', 80_000)).rejects.toThrow(/Token TikTok hết hạn/);
  });

  it('checks the advertiser is enabled and in VND', async () => {
    const usd = fakeHttp({ 'GET /open_api/v1.3/advertiser/info/': ok({ list: [{ name: 'Shop', currency: 'USD', status: 'STATUS_ENABLE' }] }) });
    await expect(new TikTokAdsAdapter(TIKTOK, usd.http).authorize()).rejects.toThrow(/VND/);
    const good = fakeHttp({ 'GET /open_api/v1.3/advertiser/info/': ok({ list: [{ name: 'Shop', currency: 'VND', status: 'STATUS_ENABLE' }] }) });
    await expect(new TikTokAdsAdapter(TIKTOK, good.http).authorize()).resolves.toEqual({ accountId: '700', accountName: 'Shop' });
    expect(good.calls[0].url.searchParams.get('advertiser_ids')).toBe('["700"]');
  });

  it('reads one day of the campaign report', async () => {
    const { http, calls } = fakeHttp({
      'GET /open_api/v1.3/report/integrated/get/': ok({
        list: [{ metrics: { spend: '120000.6', impressions: '9000', clicks: '210', conversion: '4', complete_payment_roas: '3.5' } }],
      }),
    });
    const campaign = { id: 'c1', externalId: '1801', objective: 'sales' } as Campaign;
    const metrics = await new TikTokAdsAdapter(TIKTOK, http).fetchDailyMetrics(campaign, '2026-10-09');
    expect(calls[0].url.searchParams.get('start_date')).toBe('2026-10-09');
    expect(JSON.parse(calls[0].url.searchParams.get('filtering')!)[0].filter_value).toBe('["1801"]');
    expect(metrics).toEqual({ campaignId: 'c1', date: '2026-10-09', spend: 120_001, impressions: 9000, clicks: 210, conversions: 4, revenue: 420_002 });
  });

  it('deletes real campaigns and skips demo ones', async () => {
    const { http, calls } = fakeHttp({ 'POST /open_api/v1.3/campaign/status/update/': ok({}) });
    const adapter = new TikTokAdsAdapter(TIKTOK, http);
    await adapter.deleteCampaign('tt-1a2b');
    await adapter.deleteCampaign('1801');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ advertiser_id: '700', campaign_ids: ['1801'], operation_status: 'DELETE' });
  });

  it('rejects demo campaigns before calling TikTok', async () => {
    const { http, calls } = fakeHttp({});
    await expect(new TikTokAdsAdapter(TIKTOK, http).updateStatus('tt-1a2b', 'PAUSED')).rejects.toThrow(/không tồn tại trên TikTok/);
    expect(calls).toHaveLength(0);
  });

  it('ignores conversions for traffic campaigns', () => {
    const metrics = toTikTokDailyMetrics({ id: 'c1', objective: 'traffic' } as Campaign, '2026-10-09', { metrics: { conversion: '7' } });
    expect(metrics.conversions).toBe(0);
  });
});

const GOOGLE: GoogleAdsConfig = {
  developerToken: 'dev-token-0123',
  clientId: 'client-id-0123',
  clientSecret: 'client-secret-0123',
  refreshToken: 'refresh-token-0123456789',
  customerId: '1234567890',
  loginCustomerId: '9999999999',
  apiVersion: 'v21',
};
const API = '/v21/customers/1234567890';
const TOKEN = { 'POST /token': { access_token: 'ya29.test', expires_in: 3600 } };

describe('GoogleAdsAdapter', () => {
  it('creates a budget then a paused campaign using it, with the required headers', async () => {
    const { http, calls } = fakeHttp({
      ...TOKEN,
      [`POST ${API}/campaignBudgets:mutate`]: { results: [{ resourceName: 'customers/1234567890/campaignBudgets/55' }] },
      [`POST ${API}/campaigns:mutate`]: { results: [{ resourceName: 'customers/1234567890/campaigns/777' }] },
    });
    const result = await new GoogleAdsAdapter(GOOGLE, http).createCampaign(input);
    expect(result).toEqual({ externalId: '777', platformObjective: 'SEARCH' });

    const [, budget, campaign] = calls;
    expect(budget.headers).toMatchObject({ Authorization: 'Bearer ya29.test', 'developer-token': 'dev-token-0123', 'login-customer-id': '9999999999' });
    expect(budget.body).toMatchObject({ operations: [{ create: { amountMicros: '100000000000' } }] });
    expect(campaign.body).toMatchObject({
      operations: [{ create: { status: 'PAUSED', advertisingChannelType: 'SEARCH', campaignBudget: 'customers/1234567890/campaignBudgets/55', targetSpend: {} } }],
    });
  });

  it('removes the budget again when the campaign cannot be created', async () => {
    const { http, calls } = fakeHttp({
      ...TOKEN,
      [`POST ${API}/campaignBudgets:mutate`]: { results: [{ resourceName: 'customers/1234567890/campaignBudgets/55' }] },
      [`POST ${API}/campaigns:mutate`]: { error: { message: 'Request contains an invalid argument.', details: [{ errors: [{ message: 'Bidding strategy not allowed' }] }] } },
    });
    await expect(new GoogleAdsAdapter(GOOGLE, http).createCampaign(input)).rejects.toThrow('Google Ads: Bidding strategy not allowed');
    expect(calls[calls.length - 1].body).toEqual({ operations: [{ remove: 'customers/1234567890/campaignBudgets/55' }] });
  });

  it('reuses the access token until it expires', async () => {
    let now = 0;
    const { http, calls } = fakeHttp({ ...TOKEN, [`POST ${API}/campaigns:mutate`]: { results: [] } });
    const adapter = new GoogleAdsAdapter(GOOGLE, http, () => now);
    await adapter.updateStatus('777', 'ACTIVE');
    await adapter.updateStatus('777', 'PAUSED');
    now = 3600 * 1000;
    await adapter.updateStatus('777', 'ACTIVE');
    expect(calls.filter((c) => c.url.pathname === '/token')).toHaveLength(2);
    expect(calls[1].body).toEqual({
      operations: [{ update: { resourceName: 'customers/1234567890/campaigns/777', status: 'ENABLED' }, updateMask: 'status' }],
    });
  });

  it('updates the amount on the campaign’s own budget', async () => {
    const { http, calls } = fakeHttp({
      ...TOKEN,
      [`POST ${API}/googleAds:search`]: { results: [{ campaign: { campaignBudget: 'customers/1234567890/campaignBudgets/55' } }] },
      [`POST ${API}/campaignBudgets:mutate`]: { results: [] },
    });
    await new GoogleAdsAdapter(GOOGLE, http).updateBudget('777', 60_000);
    expect(calls[2].body).toEqual({
      operations: [{ update: { resourceName: 'customers/1234567890/campaignBudgets/55', amountMicros: '60000000000' }, updateMask: 'amount_micros' }],
    });
  });

  it('removes real campaigns and skips demo ones', async () => {
    const { http, calls } = fakeHttp({ ...TOKEN, [`POST ${API}/campaigns:mutate`]: { results: [] } });
    const adapter = new GoogleAdsAdapter(GOOGLE, http);
    await adapter.deleteCampaign('gg-1a2b');
    expect(calls).toHaveLength(0);
    await adapter.deleteCampaign('777');
    expect(calls[1].body).toEqual({ operations: [{ remove: 'customers/1234567890/campaigns/777' }] });
  });

  it('checks the account is enabled and in VND', async () => {
    const search = (customer: object) => ({ ...TOKEN, [`POST ${API}/googleAds:search`]: { results: [{ customer }] } });
    const usd = fakeHttp(search({ descriptiveName: 'Shop', currencyCode: 'USD', status: 'ENABLED' }));
    await expect(new GoogleAdsAdapter(GOOGLE, usd.http).authorize()).rejects.toThrow(/VND/);
    const good = fakeHttp(search({ descriptiveName: 'Shop', currencyCode: 'VND', status: 'ENABLED' }));
    await expect(new GoogleAdsAdapter(GOOGLE, good.http).authorize()).resolves.toEqual({ accountId: '1234567890', accountName: 'Shop' });
  });

  it('explains a bad refresh token', async () => {
    const { http } = fakeHttp({ 'POST /token': { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }, 400);
    await expect(new GoogleAdsAdapter(GOOGLE, http).updateStatus('777', 'ACTIVE')).rejects.toThrow(/REFRESH_TOKEN.*expired or revoked/);
  });

  it('converts micros and counts conversion value only for sales', () => {
    const row = { metrics: { costMicros: '150000500000', impressions: '1000', clicks: '40', conversions: 2.6, conversionsValue: 900000.4 } };
    expect(toGoogleDailyMetrics({ id: 'c1', objective: 'sales' } as Campaign, '2026-10-09', row)).toEqual({
      campaignId: 'c1', date: '2026-10-09', spend: 150_001, impressions: 1000, clicks: 40, conversions: 3, revenue: 900_000,
    });
    expect(toGoogleDailyMetrics({ id: 'c1', objective: 'traffic' } as Campaign, '2026-10-09', row).revenue).toBe(0);
  });
});

describe('platform credentials from the environment', () => {
  it('stays on the mock until the trigger key is set', () => {
    expect(loadTikTokConfig({})).toBeNull();
    expect(loadGoogleAdsConfig({})).toBeNull();
  });

  it('normalises Google customer ids written with dashes', () => {
    const config = loadGoogleAdsConfig({
      GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token-0123',
      GOOGLE_ADS_CLIENT_ID: 'client-id-0123',
      GOOGLE_ADS_CLIENT_SECRET: 'client-secret-0123',
      GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token-0123456789',
      GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
    });
    expect(config).toMatchObject({ customerId: '1234567890', apiVersion: 'v21' });
  });

  it('falls back to the mock when a section is incomplete', () => {
    expect(loadTikTokConfig({ TIKTOK_ACCESS_TOKEN: 'tt-token-0123456789abcdef' })).toBeNull();
  });
});
