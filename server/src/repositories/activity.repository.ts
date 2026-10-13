import type { Db } from 'mongodb';
import type { ActivityLog } from '../domain/types.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class ActivityRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<ActivityLog>(COLLECTIONS.activities);
  }

  /** Newest first; `campaignId` narrows it to one campaign's history. */
  findRecent(limit: number, campaignId?: string): Promise<ActivityLog[]> {
    const query = campaignId ? { campaignId } : {};
    return this.collection.find(query, WITHOUT_ID).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async insert(entry: ActivityLog): Promise<void> {
    await this.collection.insertOne({ ...entry });
  }
}
