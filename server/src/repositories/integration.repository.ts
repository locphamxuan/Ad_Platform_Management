import type { Db } from 'mongodb';
import type { Integration, Platform } from '../domain/types.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class IntegrationRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<Integration>(COLLECTIONS.integrations);
  }

  findAll(): Promise<Integration[]> {
    return this.collection.find({}, WITHOUT_ID).toArray();
  }

  find(platform: Platform): Promise<Integration | null> {
    return this.collection.findOne({ platform }, WITHOUT_ID);
  }

  async isConnected(platform: Platform): Promise<boolean> {
    return (await this.find(platform))?.connected ?? false;
  }

  async upsert(integration: Integration): Promise<Integration> {
    await this.collection.replaceOne({ platform: integration.platform }, { ...integration }, { upsert: true });
    return integration;
  }
}
