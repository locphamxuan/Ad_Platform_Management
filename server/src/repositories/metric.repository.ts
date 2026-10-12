import type { Db, Filter } from 'mongodb';
import type { MetricDaily } from '../domain/types.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class MetricRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<MetricDaily>(COLLECTIONS.metrics);
  }

  findInRange(from: string, to: string, campaignIds?: readonly string[]): Promise<MetricDaily[]> {
    const query: Filter<MetricDaily> = { date: { $gte: from, $lte: to } };
    if (campaignIds) query.campaignId = { $in: [...campaignIds] };
    return this.collection.find(query, WITHOUT_ID).toArray();
  }

  async upsertMany(rows: readonly MetricDaily[]): Promise<void> {
    if (rows.length === 0) return;
    await this.collection.bulkWrite(
      rows.map((row) => ({
        replaceOne: {
          filter: { campaignId: row.campaignId, date: row.date },
          replacement: { ...row },
          upsert: true,
        },
      })),
    );
  }
}
