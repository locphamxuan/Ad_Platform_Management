import { describe, expect, it } from 'vitest';
import {
  assertDailyBudgetAllowed,
  assertRuleActionAllowed,
  BUYER_DAILY_BUDGET_LIMIT,
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
  it('caps only roles without budget approval', () => {
    expect(dailyBudgetLimit('media_buyer')).toBe(BUYER_DAILY_BUDGET_LIMIT);
    expect(dailyBudgetLimit('admin')).toBeNull();
    expect(dailyBudgetLimit('owner')).toBeNull();
  });

  it('allows budgets up to the limit and rejects anything above it', () => {
    expect(() => assertDailyBudgetAllowed('media_buyer', BUYER_DAILY_BUDGET_LIMIT)).not.toThrow();
    expect(() => assertDailyBudgetAllowed('media_buyer', BUYER_DAILY_BUDGET_LIMIT + 1)).toThrow(/tối đa/);
    expect(() => assertDailyBudgetAllowed('admin', BUYER_DAILY_BUDGET_LIMIT * 5)).not.toThrow();
  });

  it('reserves automated budget increases for budget approvers', () => {
    expect(() => assertRuleActionAllowed('media_buyer', { type: 'increase_budget' })).toThrow();
    expect(() => assertRuleActionAllowed('media_buyer', { type: 'decrease_budget' })).not.toThrow();
    expect(() => assertRuleActionAllowed('admin', { type: 'increase_budget' })).not.toThrow();
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
