import { randomUUID } from 'node:crypto';
import type { PublicUser, Role, User } from '../domain/types.js';
import { ForbiddenError, ValidationError } from '../domain/errors.js';
import { hashPassword, verifyPassword } from '../domain/password.js';
import { canManageRole, ROLE_LABELS } from '../domain/permissions.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { userActor, type ActivityService } from './activity.service.js';
import { hashToken, toPublicUser } from './auth.service.js';

export interface CreateUserInput {
  email: string;
  name: string;
  role: Role;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: Role;
  active?: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  /** Required only when the email changes */
  currentPassword?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly activity: ActivityService,
  ) {}

  async list(): Promise<PublicUser[]> {
    return (await this.users.findAll()).map(toPublicUser);
  }

  async create(input: CreateUserInput, actor: PublicUser): Promise<PublicUser> {
    assertCanManage(actor, input.role);
    const user = await this.users.insert({
      id: randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      active: true,
      passwordHash: await hashPassword(input.password),
      createdAt: new Date().toISOString(),
    });
    await this.activity.log(userActor(actor), `Thêm người dùng ${user.name} (${ROLE_LABELS[user.role]})`);
    return toPublicUser(user);
  }

  async update(id: string, changes: UpdateUserInput, actor: PublicUser): Promise<PublicUser> {
    const target = await this.users.getById(id);
    if (target.id === actor.id && (changes.role !== undefined || changes.active !== undefined)) {
      throw new ForbiddenError('Không thể tự đổi vai trò hoặc vô hiệu hoá chính mình');
    }
    assertCanManage(actor, target.role);
    if (changes.role) assertCanManage(actor, changes.role);

    const updated = await this.users.update(id, changes);
    // A deactivated user must lose access immediately, not when the session expires.
    if (changes.active === false) await this.sessions.deleteByUser(id);

    await this.activity.log(userActor(actor), describeUserChange(target.name, changes));
    return toPublicUser(updated);
  }

  /** Any signed-in user edits their own name and email; a new email needs the current password. */
  async updateProfile(actor: PublicUser, changes: UpdateProfileInput): Promise<PublicUser> {
    const user = await this.users.getById(actor.id);
    const email = changes.email?.toLowerCase();
    const emailChanged = email !== undefined && email !== user.email;
    if (emailChanged) await assertCurrentPassword(user, changes.currentPassword);

    const set: { name?: string; email?: string } = {};
    if (changes.name !== undefined && changes.name !== user.name) set.name = changes.name;
    if (emailChanged) set.email = email;
    if (Object.keys(set).length === 0) return toPublicUser(user);

    const updated = toPublicUser(await this.users.update(user.id, set));
    await this.activity.log(userActor(updated), describeProfileChange(user, set));
    return updated;
  }

  /** Keeps the session that made the change and signs every other device out. */
  async changePassword(actor: PublicUser, input: ChangePasswordInput, currentToken: string): Promise<void> {
    const user = await this.users.getById(actor.id);
    await assertCurrentPassword(user, input.currentPassword);
    if (input.currentPassword === input.newPassword) {
      throw new ValidationError('Mật khẩu mới phải khác mật khẩu hiện tại');
    }
    await this.users.update(user.id, { passwordHash: await hashPassword(input.newPassword) });
    await this.sessions.deleteOtherSessions(user.id, hashToken(currentToken));
    await this.activity.log(userActor(actor), `${user.name} đổi mật khẩu đăng nhập`);
  }
}

/** 400 rather than 401: a typo here must not look like an expired session and sign the user out. */
async function assertCurrentPassword(user: User, password: string | undefined): Promise<void> {
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    throw new ValidationError('Mật khẩu hiện tại không đúng');
  }
}

function describeProfileChange(before: User, set: { name?: string; email?: string }): string {
  const parts: string[] = [];
  if (set.name) parts.push(`đổi tên thành "${set.name}"`);
  if (set.email) parts.push(`đổi email thành ${set.email}`);
  return `${before.name} cập nhật thông tin cá nhân: ${parts.join(', ')}`;
}

function assertCanManage(actor: PublicUser, role: Role): void {
  if (!canManageRole(actor.role, role)) {
    throw new ForbiddenError(`${ROLE_LABELS[actor.role]} không thể quản lý vai trò ${ROLE_LABELS[role]}`);
  }
}

function describeUserChange(name: string, changes: UpdateUserInput): string {
  const parts: string[] = [];
  if (changes.name) parts.push(`đổi tên thành "${changes.name}"`);
  if (changes.role) parts.push(`đổi vai trò thành ${ROLE_LABELS[changes.role]}`);
  if (changes.active !== undefined) parts.push(changes.active ? 'kích hoạt' : 'vô hiệu hoá');
  return `Cập nhật người dùng ${name}: ${parts.join(', ')}`;
}
