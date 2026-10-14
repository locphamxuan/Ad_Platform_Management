import type { Db } from 'mongodb';
import type { MediaAsset } from '../domain/types.js';
import { NotFoundError } from '../domain/errors.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class MediaRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<MediaAsset>(COLLECTIONS.media);
  }

  async findById(id: string): Promise<MediaAsset | null> {
    return this.collection.findOne({ id }, WITHOUT_ID);
  }

  async getById(id: string): Promise<MediaAsset> {
    const asset = await this.findById(id);
    if (!asset) throw new NotFoundError('MediaAsset', id);
    return asset;
  }

  async findBySha256(sha256: string): Promise<MediaAsset | null> {
    return this.collection.findOne({ sha256 }, WITHOUT_ID);
  }

  async insert(asset: MediaAsset): Promise<MediaAsset> {
    await this.collection.insertOne({ ...asset });
    return asset;
  }

  async updateMetaHash(id: string, accountId: string, metaHash: string): Promise<void> {
    const key = `metaHashes.${accountId}`;
    await this.collection.updateOne({ id }, { $set: { [key]: metaHash } });
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ id });
    return res.deletedCount > 0;
  }
}

