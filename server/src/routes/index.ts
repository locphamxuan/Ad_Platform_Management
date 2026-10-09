import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container.js';
import { authenticate, bearerToken, currentUser, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { userActor } from '../services/activity.service.js';
import { toAuthProfile } from '../services/auth.service.js';
import {
  campaignListQuerySchema,
  campaignPatchSchema,
  createUserSchema,
  dateRangeSchema,
  loginSchema,
  platformSchema,
  ruleSchema,
  unifiedCampaignSchema,
  updateUserSchema,
} from './schemas.js';

const idParam = z.object({ id: z.string().min(1) });
const platformParam = z.object({ platform: platformSchema });

/** Thin HTTP layer: authenticate, check the role's permission, validate input, delegate to services. */
export function createApiRouter(c: Container): Router {
  const router = Router();

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const { token, user } = await c.auth.login(email, password);
    res.json({ token, user: toAuthProfile(user) });
  }));

  // Every route below requires a valid session.
  router.use(authenticate(c.auth));

  router.get('/auth/me', (_req, res) => {
    res.json(toAuthProfile(currentUser(res)));
  });
  router.post('/auth/logout', asyncHandler(async (req, res) => {
    await c.auth.logout(bearerToken(req) ?? '');
    res.status(204).end();
  }));

  router.get('/users', requirePermission('user:manage'), asyncHandler(async (_req, res) => {
    res.json(await c.users.list());
  }));
  router.post('/users', requirePermission('user:manage'), asyncHandler(async (req, res) => {
    res.status(201).json(await c.users.create(createUserSchema.parse(req.body), currentUser(res)));
  }));
  router.patch('/users/:id', requirePermission('user:manage'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await c.users.update(id, updateUserSchema.parse(req.body), currentUser(res)));
  }));

  router.get('/integrations', requirePermission('integration:view'), asyncHandler(async (_req, res) => {
    res.json(await c.integrations.list());
  }));
  router.post('/integrations/:platform/connect', requirePermission('integration:manage'), asyncHandler(async (req, res) => {
    const { platform } = platformParam.parse(req.params);
    res.json(await c.integrations.connect(platform, userActor(currentUser(res))));
  }));
  router.post('/integrations/:platform/disconnect', requirePermission('integration:manage'), asyncHandler(async (req, res) => {
    const { platform } = platformParam.parse(req.params);
    res.json(await c.integrations.disconnect(platform, userActor(currentUser(res))));
  }));

  router.get('/dashboard', requirePermission('report:view'), asyncHandler(async (req, res) => {
    res.json(await c.dashboard.getSummary(dateRangeSchema.parse(req.query)));
  }));

  router.get('/campaigns', requirePermission('campaign:view'), asyncHandler(async (req, res) => {
    const { platform, status, ...range } = campaignListQuerySchema.parse(req.query);
    res.json(await c.campaigns.list({ platform, status }, range));
  }));
  router.patch('/campaigns/:id', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { status, dailyBudget } = campaignPatchSchema.parse(req.body);
    const actor = userActor(currentUser(res));
    if (status) await c.campaigns.setStatus(id, status, actor);
    if (dailyBudget) await c.campaigns.setBudget(id, dailyBudget, actor);
    res.json(await c.repositories.campaigns.getById(id));
  }));
  router.post('/campaigns/unified', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const input = unifiedCampaignSchema.parse(req.body);
    res.status(201).json(await c.unifiedCampaigns.create(input, userActor(currentUser(res))));
  }));

  router.get('/rules', requirePermission('rule:view'), asyncHandler(async (_req, res) => {
    res.json(await c.rules.list());
  }));
  router.post('/rules', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    res.status(201).json(await c.rules.create(ruleSchema.parse(req.body), userActor(currentUser(res))));
  }));
  router.patch('/rules/:id', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    res.json(await c.rules.setEnabled(idParam.parse(req.params).id, enabled, userActor(currentUser(res))));
  }));
  router.delete('/rules/:id', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    await c.rules.delete(idParam.parse(req.params).id, userActor(currentUser(res)));
    res.status(204).end();
  }));
  router.post('/rules/:id/run', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    res.json(await c.rules.run(idParam.parse(req.params).id));
  }));

  router.get('/activity', requirePermission('activity:view'), asyncHandler(async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    res.json(await c.activity.listRecent(limit));
  }));

  return router;
}
