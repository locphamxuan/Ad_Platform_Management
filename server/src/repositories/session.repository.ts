import type { Db } from 'mongodb';
import type { Session } from '../domain/types.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class SessionRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<Session>(COLLECTIONS.sessions);
  }

  /** The TTL index removes expired sessions lazily, so expiry is also checked here. */
  findValid(tokenHash: string): Promise<Session | null> {
    return this.collection.findOne({ tokenHash, expiresAt: { $gt: new Date() } }, WITHOUT_ID);
  }

  async insert(session: Session): Promise<void> {
    await this.collection.insertOne({ ...session });
  }

  async delete(tokenHash: string): Promise<void> {
    await this.collection.deleteOne({ tokenHash });
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.collection.deleteMany({ userId });
  }

  /** Signs a user out everywhere except the session they are using right now. */
  async deleteOtherSessions(userId: string, keepTokenHash: string): Promise<void> {
    await this.collection.deleteMany({ userId, tokenHash: { $ne: keepTokenHash } });
  }
}
