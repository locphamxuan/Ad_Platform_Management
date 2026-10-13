import { randomUUID } from 'node:crypto';
import type { Notification } from '../domain/types.js';
import type { NotificationRepository } from '../repositories/notification.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { Actor } from './activity.service.js';

const RECENT_LIMIT = 30;

export interface NotificationInbox {
  unread: number;
  items: Notification[];
}

export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly users: UserRepository,
  ) {}

  /** Owners hear about every campaign edit or delete a media buyer makes; their own changes and rules stay silent. */
  async notifyOwnersOfBuyerChange(actor: Actor, message: string, campaignId?: string): Promise<void> {
    if (actor.role !== 'media_buyer') return;
    const owners = await this.users.findActiveByRole('owner');
    const createdAt = new Date().toISOString();
    await this.notifications.insertMany(
      owners.map((owner) => ({
        id: randomUUID(),
        recipientId: owner.id,
        actorName: actor.name,
        message,
        campaignId,
        createdAt,
      })),
    );
  }

  async inbox(userId: string): Promise<NotificationInbox> {
    const [unread, items] = await Promise.all([
      this.notifications.countUnread(userId),
      this.notifications.findRecent(userId, RECENT_LIMIT),
    ]);
    return { unread, items };
  }

  markAllRead(userId: string): Promise<void> {
    return this.notifications.markAllRead(userId, new Date().toISOString());
  }
}
