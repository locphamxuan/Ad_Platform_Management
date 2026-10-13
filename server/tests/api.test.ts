import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createContainer } from '../src/container.js';
import { connectMongo } from '../src/db/mongo.js';
import { DEMO_PASSWORD, seedDatabase } from '../src/seed.js';

/**
 * End-to-end API tests against a real MongoDB (docker compose up -d).
 * Each run uses a throwaway database; the suite is skipped when MongoDB is down.
 */
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const DB_NAME = `${process.env.TEST_DB_PREFIX ?? 'adhub_test'}_${process.pid}`;

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

const mongoUp = await isMongoReachable();

describe.skipIf(!mongoUp)('API with role-based access', () => {
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
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
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
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    for (const role of ['owner', 'admin', 'buyer', 'client']) {
      tokens[role] = (await login(`${role}@adhub.vn`)).body.token;
    }
  });

  afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await client?.db(DB_NAME).dropDatabase();
    await client?.close();
  });

  describe('authentication', () => {
    it('rejects a wrong password without revealing whether the email exists', async () => {
      const wrongPassword = await login('owner@adhub.vn', 'nope');
      const unknownEmail = await login('ghost@adhub.vn', 'nope');
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('requires a session for protected routes', async () => {
      expect((await call('/dashboard')).status).toBe(401);
      expect((await call('/dashboard', { token: 'forged' })).status).toBe(401);
    });

    it('returns the profile with role permissions', async () => {
      const me = await call('/auth/me', { token: tokens.client });
      expect(me.body).toMatchObject({ role: 'client', permissions: ['report:view'], dailyBudgetLimit: null });
      expect(me.body).not.toHaveProperty('passwordHash');
    });

    it('redirects plain-http requests that arrive through Cloudflare to https', async () => {
      const headers = { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-Proto': 'http' };
      const response = await fetch(`${baseUrl}/api/auth/me?x=1`, { headers, redirect: 'manual' });
      expect(response.status).toBe(308);
      expect(response.headers.get('location')).toBe(`https://${new URL(baseUrl).host}/api/auth/me?x=1`);
      const secure = await fetch(`${baseUrl}/health`, { headers: { ...headers, 'X-Forwarded-Proto': 'https' } });
      expect(secure.status).toBe(200);
    });

    it('invalidates the token on logout', async () => {
      const { token } = (await login('buyer@adhub.vn')).body;
      expect((await call('/auth/logout', { method: 'POST', token })).status).toBe(204);
      expect((await call('/auth/me', { token })).status).toBe(401);
    });
  });

  describe('authorization per role', () => {
    it('lets clients see reports only', async () => {
      expect((await call('/dashboard', { token: tokens.client })).status).toBe(200);
      expect((await call('/campaigns', { token: tokens.client })).status).toBe(403);
      expect((await call('/activity', { token: tokens.client })).status).toBe(403);
    });

    it('lets media buyers change budgets and records who did it', async () => {
      const [campaign] = (await call('/campaigns?platform=facebook', { token: tokens.buyer })).body;
      const patch = await call(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        token: tokens.buyer,
        body: { dailyBudget: campaign.dailyBudget + 100_000 },
      });
      expect(patch.status).toBe(200);

      const [latest] = (await call('/activity?limit=1', { token: tokens.admin })).body;
      expect(latest).toMatchObject({ actor: 'user', actorName: 'Lê Media Buyer' });
    });

    it('stops media buyers from managing integrations and users', async () => {
      expect((await call('/integrations/google/disconnect', { method: 'POST', token: tokens.buyer })).status).toBe(403);
      expect((await call('/users', { token: tokens.buyer })).status).toBe(403);
    });
  });

  describe('browser session security', () => {
    async function browserLogin(email: string) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: DEMO_PASSWORD }),
      });
      const cookies = response.headers.getSetCookie();
      const value = (name: string) => cookies.find((c) => c.startsWith(`${name}=`))!.split(';')[0].split('=')[1];
      return { cookies, session: value('adhub_session'), csrf: value('adhub_csrf') };
    }
    const cookieCall = (path: string, cookie: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
      fetch(`${baseUrl}/api${path}`, {
        method: init.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init.headers },
        body: init.method && init.method !== 'GET' ? JSON.stringify({ status: 'PAUSED' }) : undefined,
      });

    it('keeps the session in an httpOnly, SameSite=Strict cookie', async () => {
      const { cookies } = await browserLogin('admin@adhub.vn');
      const session = cookies.find((c) => c.startsWith('adhub_session='))!;
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Strict/i);
      expect(cookies.find((c) => c.startsWith('adhub_csrf='))).not.toMatch(/HttpOnly/i);
    });

    it('accepts reads with the cookie but requires the CSRF token for changes', async () => {
      const { session, csrf } = await browserLogin('admin@adhub.vn');
      const cookie = `adhub_session=${session}; adhub_csrf=${csrf}`;
      expect((await cookieCall('/auth/me', cookie)).status).toBe(200);

      const [campaign] = (await call('/campaigns?platform=tiktok', { token: tokens.admin })).body;
      const path = `/campaigns/${campaign.id}`;
      expect((await cookieCall(path, cookie, { method: 'PATCH' })).status).toBe(403);
      expect((await cookieCall(path, cookie, { method: 'PATCH', headers: { 'X-CSRF-Token': 'guess' } })).status).toBe(403);
      expect((await cookieCall(path, cookie, { method: 'PATCH', headers: { 'X-CSRF-Token': csrf } })).status).toBe(200);
    });

    it('refuses state changes coming from another site', async () => {
      const { session, csrf } = await browserLogin('admin@adhub.vn');
      const cookie = `adhub_session=${session}; adhub_csrf=${csrf}`;
      const foreign = await cookieCall('/rules/x/run', cookie, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf, Origin: 'https://evil.example' },
      });
      expect(foreign.status).toBe(403);
    });

    it('clears the cookies and the session on logout', async () => {
      const { session, csrf } = await browserLogin('buyer@adhub.vn');
      const cookie = `adhub_session=${session}; adhub_csrf=${csrf}`;
      const logout = await cookieCall('/auth/logout', cookie, { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
      expect(logout.status).toBe(204);
      expect(logout.headers.getSetCookie().some((c) => c.startsWith('adhub_session=;'))).toBe(true);
      expect((await cookieCall('/auth/me', cookie)).status).toBe(401);
    });

    it('locks out repeated wrong passwords from one visitor', async () => {
      const attempt = (password: string) =>
        fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.9', 'X-Forwarded-Proto': 'https' },
          body: JSON.stringify({ email: 'attacker-target@adhub.vn', password }),
        });
      for (let i = 0; i < 5; i++) expect((await attempt('wrong')).status).toBe(401);
      const blocked = await attempt('wrong');
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    });

    it('sends basic security headers', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    });
  });

  describe('real vs simulated platform connections', () => {
    it('reports simulated platforms as not live', async () => {
      const integrations = (await call('/integrations', { token: tokens.admin })).body as { platform: string; live: boolean }[];
      expect(integrations.every((i) => i.live === false)).toBe(true);
    });

    it('requires reconnecting Facebook once real Meta credentials are configured', async () => {
      const meta = {
        accessToken: 'test-token-not-used-0000',
        appSecret: 'test-secret-not-used',
        adAccountId: 'act_1',
        pageId: '1',
        apiVersion: 'v23.0',
      };
      const liveServer = createApp(createContainer(client.db(DB_NAME), { meta })).listen(0);
      await new Promise((resolve) => liveServer.once('listening', resolve));
      const liveUrl = `http://127.0.0.1:${(liveServer.address() as AddressInfo).port}/api`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.admin}` };
      try {
        const integrations = await (await fetch(`${liveUrl}/integrations`, { headers })).json();
        expect(integrations.find((i: { platform: string }) => i.platform === 'facebook')).toMatchObject({
          connected: false,
          live: true,
        });
        const [campaign] = (await call('/campaigns?platform=facebook', { token: tokens.admin })).body;
        const patch = await fetch(`${liveUrl}/campaigns/${campaign.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }),
        });
        expect(patch.status).toBe(409);
      } finally {
        await new Promise((resolve) => liveServer.close(resolve));
      }
    });
  });

  describe('workspace budget limit', () => {
    const LIMIT = 10_000_000;
    const setLimit = (buyerDailyBudgetLimit: number | null, token = tokens.owner) =>
      call('/settings', { method: 'PUT', token, body: { buyerDailyBudgetLimit } });
    const facebookCampaign = async () => (await call('/campaigns?platform=facebook', { token: tokens.buyer })).body[0];
    const setBudget = async (dailyBudget: number, token: string) =>
      call(`/campaigns/${(await facebookCampaign()).id}`, { method: 'PATCH', token, body: { dailyBudget } });
    const unified = (totalDailyBudget: number) => ({
      name: 'Kiểm tra hạn mức',
      objective: 'sales',
      totalDailyBudget,
      allocations: [
        { platform: 'facebook', percent: 50 },
        { platform: 'tiktok', percent: 50 },
      ],
      creative: { headline: 'Sale', primaryText: 'Giảm giá', landingUrl: 'https://example.com' },
    });
    const scaleRule = {
      name: 'Scale nhanh',
      condition: { metric: 'roas', operator: 'gt', threshold: 3 },
      action: { type: 'increase_budget', value: 20 },
    };

    it('leaves media buyers uncapped by default', async () => {
      expect((await call('/settings', { token: tokens.owner })).body).toEqual({ buyerDailyBudgetLimit: null });
      expect((await setBudget(LIMIT * 5, tokens.buyer)).status).toBe(200);
      expect((await call('/rules', { method: 'POST', token: tokens.buyer, body: scaleRule })).status).toBe(201);
    });

    it('lets only the owner change the limit, and logs it', async () => {
      expect((await setLimit(LIMIT, tokens.admin)).status).toBe(403);
      expect((await setLimit(LIMIT)).body).toMatchObject({ buyerDailyBudgetLimit: LIMIT });
      const [latest] = (await call('/activity?limit=1', { token: tokens.admin })).body;
      expect(latest.message).toContain('không giới hạn');
      expect((await call('/auth/me', { token: tokens.buyer })).body.dailyBudgetLimit).toBe(LIMIT);
      expect((await call('/auth/me', { token: tokens.admin })).body.dailyBudgetLimit).toBeNull();
    });

    it('requires budget approval above the limit once it is set', async () => {
      expect((await setBudget(LIMIT + 1_000_000, tokens.buyer)).status).toBe(403);
      expect((await setBudget(LIMIT + 1_000_000, tokens.admin)).status).toBe(200);
    });

    it('checks the limit per channel when creating a multi-channel campaign', async () => {
      // Split 50/50: 2 × limit puts each channel exactly at the limit.
      const create = (total: number) => call('/campaigns/unified', { method: 'POST', token: tokens.buyer, body: unified(total) });
      expect((await create(LIMIT * 2)).status).toBe(201);
      expect((await create(LIMIT * 3)).status).toBe(403);
    });

    it('reserves automated budget increases for admins while capped', async () => {
      expect((await call('/rules', { method: 'POST', token: tokens.buyer, body: scaleRule })).status).toBe(403);
      const draft = await call('/rules', { method: 'POST', token: tokens.buyer, body: { ...scaleRule, enabled: false } });
      expect(draft.status).toBe(201);
      const enable = { method: 'PATCH', body: { enabled: true } };
      expect((await call(`/rules/${draft.body.id}`, { ...enable, token: tokens.buyer })).status).toBe(403);
      expect((await call(`/rules/${draft.body.id}`, { ...enable, token: tokens.admin })).status).toBe(200);
    });

    it('lifts the cap again when the owner switches it off', async () => {
      expect((await setLimit(null)).body).toMatchObject({ buyerDailyBudgetLimit: null });
      expect((await setBudget(LIMIT * 3, tokens.buyer)).status).toBe(200);
    });

    it('rejects invalid limits', async () => {
      expect((await setLimit(0)).status).toBe(400);
      expect((await setLimit(-5)).status).toBe(400);
    });
  });

  describe('user management', () => {
    it('lets admins add lower roles but not owners', async () => {
      const buyer = await call('/users', {
        method: 'POST',
        token: tokens.admin,
        body: { email: 'new.buyer@adhub.vn', name: 'Buyer Mới', role: 'media_buyer', password: 'password123' },
      });
      expect(buyer.status).toBe(201);
      expect(buyer.body).not.toHaveProperty('passwordHash');

      const owner = await call('/users', {
        method: 'POST',
        token: tokens.admin,
        body: { email: 'new.owner@adhub.vn', name: 'Owner Mới', role: 'owner', password: 'password123' },
      });
      expect(owner.status).toBe(403);
    });

    it('reserves appointing admins for owners', async () => {
      const admin = { name: 'Admin Mới', role: 'admin', password: 'password123' };
      const byAdmin = await call('/users', { method: 'POST', token: tokens.admin, body: { ...admin, email: 'a1@adhub.vn' } });
      const byOwner = await call('/users', { method: 'POST', token: tokens.owner, body: { ...admin, email: 'a2@adhub.vn' } });
      expect(byAdmin.status).toBe(403);
      expect(byOwner.status).toBe(201);

      const [owner, adminMe] = await Promise.all([
        call('/auth/me', { token: tokens.owner }),
        call('/auth/me', { token: tokens.admin }),
      ]);
      expect(owner.body.permissions).toContain('workspace:manage');
      expect(adminMe.body.permissions).not.toContain('workspace:manage');
    });

    it('rejects duplicate emails', async () => {
      const duplicate = await call('/users', {
        method: 'POST',
        token: tokens.owner,
        body: { email: 'OWNER@adhub.vn', name: 'Trùng', role: 'client', password: 'password123' },
      });
      expect(duplicate.status).toBe(409);
    });

    it('prevents users from changing their own role', async () => {
      const me = (await call('/auth/me', { token: tokens.owner })).body;
      const result = await call(`/users/${me.id}`, { method: 'PATCH', token: tokens.owner, body: { role: 'client' } });
      expect(result.status).toBe(403);
    });

    it('revokes sessions of a deactivated user immediately', async () => {
      const users = (await call('/users', { token: tokens.owner })).body as { id: string; email: string }[];
      const client = users.find((u) => u.email === 'client@adhub.vn')!;
      const result = await call(`/users/${client.id}`, { method: 'PATCH', token: tokens.admin, body: { active: false } });
      expect(result.status).toBe(200);
      expect((await call('/dashboard', { token: tokens.client })).status).toBe(401);
      expect((await login('client@adhub.vn')).status).toBe(401);
    });

    it('moves accounts with the retired viewer role to client on connect', async () => {
      const users = client.db(DB_NAME).collection('users');
      await users.insertOne({ id: 'legacy-viewer', email: 'legacy.viewer@adhub.vn', name: 'Legacy', role: 'viewer' });
      const reconnect = await connectMongo(MONGODB_URI, DB_NAME);
      await reconnect.client.close();
      expect((await users.findOne({ id: 'legacy-viewer' }))?.role).toBe('client');
    });
  });
});
