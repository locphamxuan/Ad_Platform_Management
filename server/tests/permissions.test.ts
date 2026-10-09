import { describe, expect, it } from 'vitest';
import { canManageRole, hasPermission, PERMISSIONS } from '../src/domain/permissions.js';
import { ROLES } from '../src/domain/types.js';

describe('hasPermission', () => {
  it('gives owner every permission', () => {
    for (const permission of PERMISSIONS) expect(hasPermission('owner', permission)).toBe(true);
  });

  it('separates admin from owner: operations yes, workspace governance no', () => {
    expect(PERMISSIONS.filter((p) => !hasPermission('admin', p))).toEqual(['workspace:manage']);
  });

  it('gives every role a distinct permission set', () => {
    const sets = ROLES.map((role) => PERMISSIONS.filter((p) => hasPermission(role, p)).join(','));
    expect(new Set(sets).size).toBe(ROLES.length);
  });

  it('lets media buyers operate campaigns and rules but not integrations or users', () => {
    expect(hasPermission('media_buyer', 'campaign:manage')).toBe(true);
    expect(hasPermission('media_buyer', 'rule:manage')).toBe(true);
    expect(hasPermission('media_buyer', 'integration:manage')).toBe(false);
    expect(hasPermission('media_buyer', 'user:manage')).toBe(false);
  });

  it('keeps viewers read-only', () => {
    const writes = PERMISSIONS.filter((p) => p.endsWith(':manage'));
    for (const permission of writes) expect(hasPermission('viewer', permission)).toBe(false);
    expect(hasPermission('viewer', 'campaign:view')).toBe(true);
  });

  it('limits clients to reports only', () => {
    expect(PERMISSIONS.filter((p) => hasPermission('client', p))).toEqual(['report:view']);
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
    expect(canManageRole('viewer', 'client')).toBe(false);
  });
});
