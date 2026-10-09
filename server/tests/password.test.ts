import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/domain/password.js';

describe('password hashing', () => {
  it('verifies the original password and rejects others', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed stored values', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});
