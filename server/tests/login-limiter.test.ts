import { describe, expect, it } from 'vitest';
import { TooManyRequestsError } from '../src/domain/errors.js';
import { LoginLimiter } from '../src/middleware/security.js';

describe('LoginLimiter', () => {
  const setup = () => {
    let now = 0;
    const limiter = new LoginLimiter(3, 60_000, () => now);
    return { limiter, advance: (ms: number) => (now += ms) };
  };

  it('blocks an email after too many wrong passwords, then lets it retry once the window ends', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure('1.1.1.1', 'Owner@AdHub.vn');
    expect(() => limiter.assertAllowed('2.2.2.2', 'owner@adhub.vn')).toThrow(TooManyRequestsError);
    advance(60_000);
    expect(() => limiter.assertAllowed('2.2.2.2', 'owner@adhub.vn')).not.toThrow();
  });

  it('blocks an IP that sprays many different emails', () => {
    const { limiter } = setup();
    for (const email of ['a@x.vn', 'b@x.vn', 'c@x.vn']) limiter.recordFailure('1.1.1.1', email);
    expect(() => limiter.assertAllowed('1.1.1.1', 'd@x.vn')).toThrow(TooManyRequestsError);
    expect(() => limiter.assertAllowed('3.3.3.3', 'd@x.vn')).not.toThrow();
  });

  it('reports how long to wait', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure('1.1.1.1', 'a@x.vn');
    advance(15_000);
    try {
      limiter.assertAllowed('1.1.1.1', 'a@x.vn');
      expect.unreachable();
    } catch (error) {
      expect((error as TooManyRequestsError).retryAfterSeconds).toBe(45);
    }
  });

  it('clears the email counter after a successful login', () => {
    const { limiter } = setup();
    limiter.recordFailure('1.1.1.1', 'a@x.vn');
    limiter.recordFailure('1.1.1.1', 'a@x.vn');
    limiter.recordSuccess('1.1.1.1', 'a@x.vn');
    limiter.recordFailure('9.9.9.9', 'a@x.vn');
    expect(() => limiter.assertAllowed('9.9.9.9', 'a@x.vn')).not.toThrow();
  });
});
