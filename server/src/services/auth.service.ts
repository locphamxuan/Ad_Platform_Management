import { createHash, randomBytes } from 'node:crypto';
import type { PublicUser, User } from '../domain/types.js';
import { UnauthorizedError } from '../domain/errors.js';
import { verifyPassword } from '../domain/password.js';
import { ROLE_PERMISSIONS } from '../domain/permissions.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const toPublicUser = ({ passwordHash: _passwordHash, ...user }: User): PublicUser => user;

/** What the client needs to render: the user, what their role allows and their current budget cap. */
export const toAuthProfile = (user: PublicUser, dailyBudgetLimit: number | null) => ({
  ...user,
  permissions: ROLE_PERMISSIONS[user.role],
  dailyBudgetLimit,
});

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const user = await this.users.findByEmail(email);
    // Same error for unknown email and wrong password: do not reveal which accounts exist.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
    }
    if (!user.active) throw new UnauthorizedError('Tài khoản đã bị vô hiệu hoá');

    const token = randomBytes(32).toString('base64url');
    await this.sessions.insert({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    const updated = await this.users.update(user.id, { lastLoginAt: new Date().toISOString() });
    return { token, user: toPublicUser(updated) };
  }

  async authenticate(token: string): Promise<PublicUser> {
    const session = await this.sessions.findValid(hashToken(token));
    const user = session && (await this.users.findById(session.userId));
    if (!user?.active) throw new UnauthorizedError('Phiên đăng nhập đã hết hạn');
    return toPublicUser(user);
  }

  logout(token: string): Promise<void> {
    return this.sessions.delete(hashToken(token));
  }
}
