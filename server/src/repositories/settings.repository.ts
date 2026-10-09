import type { Db } from 'mongodb';
import type { WorkspaceSettings } from '../domain/types.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

/** A fresh workspace leaves media buyers uncapped until the owner sets a limit. */
export const DEFAULT_SETTINGS: WorkspaceSettings = { buyerDailyBudgetLimit: null };

/** The collection holds a single document: the workspace's settings. */
export class SettingsRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<WorkspaceSettings>(COLLECTIONS.settings);
  }

  async get(): Promise<WorkspaceSettings> {
    return (await this.collection.findOne({}, WITHOUT_ID)) ?? DEFAULT_SETTINGS;
  }

  async save(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
    await this.collection.replaceOne({}, { ...settings }, { upsert: true });
    return settings;
  }
}
