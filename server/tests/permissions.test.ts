import { describe, expect, it } from 'vitest';
import {
  assertDailyBudgetAllowed,
  assertRuleActionAllowed,
  canManageRole,
  dailyBudgetLimit,
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '../src/domain/permissions.js';
import { ROLES } from '../src/domain/types.js';

describe('hasPermission', () => {
  it('gives owner every permission', () => {
    for (const permission of PERMISSIONS) expect(hasPermission('owner', permission)).toBe(true);
  });

  it('nests every level inside the one above it', () => {
    for (let i = 1; i < ROLES.length; i++) {
      const higher = ROLE_PERMISSIONS[ROLES[i - 1]];
      const lower = ROLE_PERMISSIONS[ROLES[i]];
      expect(lower.every((p) => higher.includes(p))).toBe(true);
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });

  it('separates admin from owner: operations yes, workspace governance no', () => {
    expect(PERMISSIONS.filter((p) => !hasPermission('admin', p))).toEqual(['workspace:manage']);
  });

  it('lets media buyers operate campaigns and rules but not integrations, users or large budgets', () => {
    expect(hasPermission('media_buyer', 'campaign:manage')).toBe(true);
    expect(hasPermission('media_buyer', 'rule:manage')).toBe(true);
    expect(hasPermission('media_buyer', 'integration:view')).toBe(true);
    expect(hasPermission('media_buyer', 'integration:manage')).toBe(false);
    expect(hasPermission('media_buyer', 'user:manage')).toBe(false);
    expect(hasPermission('media_buyer', 'budget:approve')).toBe(false);
  });

  it('limits clients to reports only', () => {
    expect(ROLE_PERMISSIONS.client).toEqual(['report:view']);
  });
});

describe('budget limits', () => {
  const LIMIT = 10_000_000;

  it('caps only roles without budget approval, and only when the workspace sets a limit', () => {
    expect(dailyBudgetLimit('media_buyer', LIMIT)).toBe(LIMIT);
    expect(dailyBudgetLimit('media_buyer', null)).toBeNull();
    expect(dailyBudgetLimit('admin', LIMIT)).toBeNull();
    expect(dailyBudgetLimit('owner', LIMIT)).toBeNull();
  });

  it('allows budgets up to the limit and rejects anything above it', () => {
    expect(() => assertDailyBudgetAllowed('media_buyer', LIMIT, LIMIT)).not.toThrow();
    expect(() => assertDailyBudgetAllowed('media_buyer', LIMIT, LIMIT + 1)).toThrow(/tối đa/);
    expect(() => assertDailyBudgetAllowed('media_buyer', null, LIMIT * 100)).not.toThrow();
  });

  it('blocks automated budget increases only for capped roles', () => {
    expect(() => assertRuleActionAllowed('media_buyer', LIMIT, { type: 'increase_budget' })).toThrow();
    expect(() => assertRuleActionAllowed('media_buyer', LIMIT, { type: 'decrease_budget' })).not.toThrow();
    expect(() => assertRuleActionAllowed('media_buyer', null, { type: 'increase_budget' })).not.toThrow();
  });
});

describe('canManageRole', () => {
  it('lets owners manage every role', () => {
    for (const role of ROLES) expect(canManageRole('owner', role)).toBe(true);
  });

  it('lets admins manage only roles below admin', () => {
    expect(canManageRole('admin', 'owner')).toBe(false);
    expect(canManageRole('admin', 'admin')).toBe(false);
    expect(canManageRole('admin', 'media_buyer')).toBe(true);
    expect(canManageRole('admin', 'client')).toBe(true);
  });

  it('denies roles without user management', () => {
    expect(canManageRole('media_buyer', 'client')).toBe(false);
    expect(canManageRole('client', 'client')).toBe(false);
  });
});
