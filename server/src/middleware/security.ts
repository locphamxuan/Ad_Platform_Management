import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { ForbiddenError, TooManyRequestsError } from '../domain/errors.js';

/** httpOnly: page scripts (and therefore XSS) can never read the session token. */
export const SESSION_COOKIE = 'adhub_session';
/** Readable by the page on purpose: it echoes the value in X-CSRF-Token (double-submit). */
export const CSRF_COOKIE = 'adhub_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function readCookie(req: Request, name: string): string | null {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

/** Cloudflare terminates TLS and forwards plain http with X-Forwarded-Proto: https. */
const isHttps = (req: Request) => req.secure || req.headers['x-forwarded-proto'] === 'https';

export function setSessionCookies(req: Request, res: Response, token: string) {
  const options = { sameSite: 'strict' as const, secure: isHttps(req), maxAge: SESSION_MAX_AGE_MS, path: '/' };
  res.cookie(SESSION_COOKIE, token, { ...options, httpOnly: true });
  res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), options);
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

const sameString = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Cross-site request forgery guard for state-changing requests:
 * - a browser Origin from another site is always refused;
 * - a request authenticated by the session cookie must echo the CSRF cookie in X-CSRF-Token,
 *   which another site cannot read. Bearer-token callers (scripts, tests) send no cookie and skip this.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // malformed Origin: treat as foreign
    }
    if (originHost !== req.headers.host) return next(new ForbiddenError('Yêu cầu từ trang khác bị từ chối'));
  }

  if (readCookie(req, SESSION_COOKIE) && !req.headers.authorization) {
    const expected = readCookie(req, CSRF_COOKIE);
    const sent = req.header(CSRF_HEADER);
    if (!expected || !sent || !sameString(expected, sent)) {
      return next(new ForbiddenError('Phiên làm việc không hợp lệ, hãy tải lại trang'));
    }
  }
  next();
};

/** Conservative defaults for an app that never needs to be framed or sniffed. */
export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
};

/** Behind Cloudflare the socket address is the tunnel; the visitor is in CF-Connecting-IP. */
export function clientIp(req: Request): string {
  const forwarded = req.headers['cf-connecting-ip'];
  return (typeof forwarded === 'string' && forwarded) || req.socket.remoteAddress || 'unknown';
}

interface Bucket {
  failures: number;
  resetAt: number;
}

/**
 * Brute-force guard for the login form: after `maxFailures` wrong passwords within `windowMs`
 * from one IP or for one email, further attempts are refused until the window ends.
 * In memory on purpose: one server process, and a restart only shortens the lockout.
 */
export class LoginLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  private keys(ip: string, email: string) {
    return [`ip:${ip}`, `email:${email.trim().toLowerCase()}`];
  }

  private live(key: string): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= this.now()) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  assertAllowed(ip: string, email: string): void {
    for (const key of this.keys(ip, email)) {
      const bucket = this.live(key);
      if (bucket && bucket.failures >= this.maxFailures) {
        const seconds = Math.ceil((bucket.resetAt - this.now()) / 1000);
        throw new TooManyRequestsError(
          `Đăng nhập sai quá nhiều lần, thử lại sau ${Math.ceil(seconds / 60)} phút`,
          seconds,
        );
      }
    }
  }

  recordFailure(ip: string, email: string): void {
    for (const key of this.keys(ip, email)) {
      const bucket = this.live(key) ?? { failures: 0, resetAt: this.now() + this.windowMs };
      bucket.failures += 1;
      this.buckets.set(key, bucket);
    }
    // Keep memory bounded if someone sprays many emails.
    if (this.buckets.size > 10_000) {
      for (const key of this.buckets.keys()) this.live(key);
    }
  }

  recordSuccess(ip: string, email: string): void {
    // Only the email bucket: a shared office IP keeps counting other people's failures.
    this.buckets.delete(this.keys(ip, email)[1]);
  }
}
