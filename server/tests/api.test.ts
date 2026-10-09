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
const DB_NAME = `adhub_test_${process.pid}`;

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
    server = createApp(createContainer(db)).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    for (const role of ['owner', 'admin', 'buyer', 'viewer', 'client']) {
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
      expect(me.body).toMatchObject({ role: 'client', permissions: ['report:view'] });
      expect(me.body).not.toHaveProperty('passwordHash');
    });

    it('invalidates the token on logout', async () => {
      const { token } = (await login('viewer@adhub.vn')).body;
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

    it('keeps viewers read-only', async () => {
      const campaigns = await call('/campaigns', { token: tokens.viewer });
      expect(campaigns.status).toBe(200);
      const patch = await call(`/campaigns/${campaigns.body[0].id}`, {
        method: 'PATCH',
        token: tokens.viewer,
        body: { status: 'PAUSED' },
      });
      expect(patch.status).toBe(403);
    });

    it('lets media buyers change budgets and records who did it', async () => {
      const [campaign] = (await call('/campaigns?platform=facebook', { token: tokens.buyer })).body;
      const patch = await call(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        token: tokens.buyer,
        body: { dailyBudget: campaign.dailyBudget + 100_000 },
      });
      expect(patch.status).toBe(200);

      const [latest] = (await call('/activity?limit=1', { token: tokens.viewer })).body;
      expect(latest).toMatchObject({ actor: 'user', actorName: 'Lê Media Buyer' });
    });

    it('stops media buyers from managing integrations and users', async () => {
      expect((await call('/integrations/google/disconnect', { method: 'POST', token: tokens.buyer })).status).toBe(403);
      expect((await call('/users', { token: tokens.buyer })).status).toBe(403);
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
        body: { email: 'OWNER@adhub.vn', name: 'Trùng', role: 'viewer', password: 'password123' },
      });
      expect(duplicate.status).toBe(409);
    });

    it('prevents users from changing their own role', async () => {
      const me = (await call('/auth/me', { token: tokens.owner })).body;
      const result = await call(`/users/${me.id}`, { method: 'PATCH', token: tokens.owner, body: { role: 'viewer' } });
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
  });
});
