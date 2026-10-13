import type { Db } from 'mongodb';
import type { Notification } from '../domain/types.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class NotificationRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<Notification>(COLLECTIONS.notifications);
  }

  findRecent(recipientId: string, limit: number): Promise<Notification[]> {
    return this.collection.find({ recipientId }, WITHOUT_ID).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  countUnread(recipientId: string): Promise<number> {
    return this.collection.countDocuments({ recipientId, readAt: { $exists: false } });
  }

  async insertMany(notifications: readonly Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    await this.collection.insertMany(notifications.map((n) => ({ ...n })));
  }

  async markAllRead(recipientId: string, readAt: string): Promise<void> {
    await this.collection.updateMany({ recipientId, readAt: { $exists: false } }, { $set: { readAt } });
  }
}
