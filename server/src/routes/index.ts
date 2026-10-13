import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container.js';
import { allocateBudget } from '../domain/budget.js';
import { assertDailyBudgetAllowed, assertRuleActionAllowed } from '../domain/permissions.js';
import { UnauthorizedError } from '../domain/errors.js';
import { authenticate, currentUser, requirePermission, sessionToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import {
  clearSessionCookies,
  clientIp,
  csrfProtection,
  LoginLimiter,
  setSessionCookies,
} from '../middleware/security.js';
import { userActor } from '../services/activity.service.js';
import { toAuthProfile } from '../services/auth.service.js';
import {
  bulkCampaignDeleteSchema,
  bulkCampaignStatusSchema,
  campaignListQuerySchema,
  campaignPatchSchema,
  changePasswordSchema,
  createUserSchema,
  dateRangeSchema,
  duplicateCampaignSchema,
  loginSchema,
  platformSchema,
  ruleSchema,
  settingsSchema,
  unifiedCampaignSchema,
  updateProfileSchema,
  updateUserSchema,
} from './schemas.js';

const idParam = z.object({ id: z.string().min(1) });
const platformParam = z.object({ platform: platformSchema });

/** Thin HTTP layer: authenticate, check the role's permission, validate input, delegate to services. */
export function createApiRouter(c: Container, loginLimiter = new LoginLimiter()): Router {
  const router = Router();
  router.use(csrfProtection);

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const ip = clientIp(req);
    loginLimiter.assertAllowed(ip, email);
    const session = await c.auth.login(email, password).catch((error: unknown) => {
      if (error instanceof UnauthorizedError) loginLimiter.recordFailure(ip, email);
      throw error;
    });
    loginLimiter.recordSuccess(ip, email);
    setSessionCookies(req, res, session.token);
    // The token is also returned for non-browser API clients; the web app relies on the cookie only.
    res.json({ token: session.token, user: toAuthProfile(session.user, await c.settings.budgetLimitFor(session.user.role)) });
  }));

  // Every route below requires a valid session.
  router.use(authenticate(c.auth));

  router.get('/auth/me', asyncHandler(async (_req, res) => {
    const user = currentUser(res);
    res.json(toAuthProfile(user, await c.settings.budgetLimitFor(user.role)));
  }));
  router.patch('/auth/me', asyncHandler(async (req, res) => {
    const user = await c.users.updateProfile(currentUser(res), updateProfileSchema.parse(req.body));
    res.json(toAuthProfile(user, await c.settings.budgetLimitFor(user.role)));
  }));
  router.post('/auth/me/password', asyncHandler(async (req, res) => {
    await c.users.changePassword(currentUser(res), changePasswordSchema.parse(req.body), sessionToken(req) ?? '');
    res.status(204).end();
  }));
  router.post('/auth/logout', asyncHandler(async (req, res) => {
    await c.auth.logout(sessionToken(req) ?? '');
    clearSessionCookies(res);
    res.status(204).end();
  }));

  // Every signed-in user reads only their own notifications.
  router.get('/notifications', asyncHandler(async (_req, res) => {
    res.json(await c.notifications.inbox(currentUser(res).id));
  }));
  router.post('/notifications/read-all', asyncHandler(async (_req, res) => {
    await c.notifications.markAllRead(currentUser(res).id);
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

  router.get('/settings', requirePermission('workspace:manage'), asyncHandler(async (_req, res) => {
    res.json(await c.settings.get());
  }));
  router.put('/settings', requirePermission('workspace:manage'), asyncHandler(async (req, res) => {
    const { buyerDailyBudgetLimit } = settingsSchema.parse(req.body);
    res.json(await c.settings.setBuyerDailyBudgetLimit(buyerDailyBudgetLimit, userActor(currentUser(res))));
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
  router.get('/campaigns/:id', requirePermission('campaign:view'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await c.campaigns.getDetail(id, dateRangeSchema.parse(req.query)));
  }));
  router.get('/campaigns/:id/accounts', requirePermission('campaign:view'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { platform } = z.object({ platform: platformSchema }).parse(req.query);
    res.json(await c.campaigns.adviseOn(id, platform));
  }));
  router.post('/campaigns/:id/duplicate', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { accountId } = duplicateCampaignSchema.parse(req.body);
    const user = currentUser(res);
    // The copy keeps the original budget, which must still be within this user's cap.
    const { dailyBudget } = await c.repositories.campaigns.getById(id);
    assertDailyBudgetAllowed(user.role, await c.settings.budgetLimitFor(user.role), dailyBudget);
    res.status(201).json(await c.campaigns.duplicateToAccount(id, accountId, userActor(user)));
  }));
  router.patch('/campaigns/:id', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { status, dailyBudget } = campaignPatchSchema.parse(req.body);
    const user = currentUser(res);
    if (dailyBudget) assertDailyBudgetAllowed(user.role, await c.settings.budgetLimitFor(user.role), dailyBudget);
    const actor = userActor(user);
    if (status) await c.campaigns.setStatus(id, status, actor);
    if (dailyBudget) await c.campaigns.setBudget(id, dailyBudget, actor);
    res.json(await c.repositories.campaigns.getById(id));
  }));
  router.post('/campaigns/bulk-status', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const { ids, status } = bulkCampaignStatusSchema.parse(req.body);
    res.json(await c.campaigns.setStatusMany(ids, status, userActor(currentUser(res))));
  }));
  router.post('/campaigns/bulk-delete', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const { ids } = bulkCampaignDeleteSchema.parse(req.body);
    res.json(await c.campaigns.deleteMany(ids, userActor(currentUser(res))));
  }));
  router.post('/campaigns/unified', requirePermission('campaign:manage'), asyncHandler(async (req, res) => {
    const input = unifiedCampaignSchema.parse(req.body);
    const user = currentUser(res);
    // The cap is per campaign, so check what each channel would actually receive.
    const limit = await c.settings.budgetLimitFor(user.role);
    for (const { dailyBudget } of allocateBudget(input.totalDailyBudget, input.allocations)) {
      assertDailyBudgetAllowed(user.role, limit, dailyBudget);
    }
    res.status(201).json(await c.unifiedCampaigns.create(input, userActor(user)));
  }));

  router.get('/rules', requirePermission('rule:view'), asyncHandler(async (_req, res) => {
    res.json(await c.rules.list());
  }));
  router.post('/rules', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    const input = ruleSchema.parse(req.body);
    const user = currentUser(res);
    if (input.enabled) assertRuleActionAllowed(user.role, await c.settings.budgetLimitFor(user.role), input.action);
    res.status(201).json(await c.rules.create(input, userActor(user)));
  }));
  router.patch('/rules/:id', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const user = currentUser(res);
    if (enabled) {
      const { action } = await c.repositories.rules.getById(id);
      assertRuleActionAllowed(user.role, await c.settings.budgetLimitFor(user.role), action);
    }
    res.json(await c.rules.setEnabled(id, enabled, userActor(user)));
  }));
  router.delete('/rules/:id', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    await c.rules.delete(idParam.parse(req.params).id, userActor(currentUser(res)));
    res.status(204).end();
  }));
  router.post('/rules/:id/run', requirePermission('rule:manage'), asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { role } = currentUser(res);
    const { action } = await c.repositories.rules.getById(id);
    assertRuleActionAllowed(role, await c.settings.budgetLimitFor(role), action);
    res.json(await c.rules.run(id));
  }));

  router.get('/activity', requirePermission('activity:view'), asyncHandler(async (req, res) => {
    const { limit, campaignId } = z
      .object({ limit: z.coerce.number().int().min(1).max(500).default(100), campaignId: z.string().min(1).optional() })
      .parse(req.query);
    res.json(await c.activity.listRecent(limit, campaignId));
  }));

  return router;
}
