import { randomUUID } from 'node:crypto';
import type { PublicUser, Role } from '../domain/types.js';
import { ForbiddenError } from '../domain/errors.js';
import { hashPassword } from '../domain/password.js';
import { canManageRole, ROLE_LABELS } from '../domain/permissions.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { userActor, type ActivityService } from './activity.service.js';
import { toPublicUser } from './auth.service.js';

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
