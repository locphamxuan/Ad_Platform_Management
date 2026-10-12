import type { Db, Filter } from 'mongodb';
import type { Campaign, CampaignStatus, Platform } from '../domain/types.js';
import { NotFoundError } from '../domain/errors.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export interface CampaignFilter {
  platform?: Platform;
  status?: CampaignStatus;
}

export class CampaignRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<Campaign>(COLLECTIONS.campaigns);
  }

  findAll(filter: CampaignFilter = {}): Promise<Campaign[]> {
    const query: Filter<Campaign> = {};
    if (filter.platform) query.platform = filter.platform;
    if (filter.status) query.status = filter.status;
    return this.collection.find(query, WITHOUT_ID).sort({ createdAt: -1 }).toArray();
  }

  async getById(id: string): Promise<Campaign> {
    const campaign = await this.collection.findOne({ id }, WITHOUT_ID);
    if (!campaign) throw new NotFoundError('Campaign', id);
    return campaign;
  }

  async insert(campaign: Campaign): Promise<Campaign> {
    await this.collection.insertOne({ ...campaign });
    return campaign;
  }

  async update(id: string, changes: Partial<Pick<Campaign, 'status' | 'dailyBudget'>>): Promise<Campaign> {
    const updated = await this.collection.findOneAndUpdate(
      { id },
      { $set: changes },
      { ...WITHOUT_ID, returnDocument: 'after' },
    );
    if (!updated) throw new NotFoundError('Campaign', id);
    return updated;
  }
}
