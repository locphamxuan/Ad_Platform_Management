import type { Db } from 'mongodb';
import type { Rule } from '../domain/types.js';
import { NotFoundError } from '../domain/errors.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class RuleRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<Rule>(COLLECTIONS.rules);
  }

  findAll(): Promise<Rule[]> {
    return this.collection.find({}, WITHOUT_ID).sort({ createdAt: -1 }).toArray();
  }

  findEnabled(): Promise<Rule[]> {
    return this.collection.find({ enabled: true }, WITHOUT_ID).toArray();
  }

  async getById(id: string): Promise<Rule> {
    const rule = await this.collection.findOne({ id }, WITHOUT_ID);
    if (!rule) throw new NotFoundError('Rule', id);
    return rule;
  }

  async insert(rule: Rule): Promise<Rule> {
    await this.collection.insertOne({ ...rule });
    return rule;
  }

  async update(id: string, changes: Partial<Rule>): Promise<Rule> {
    const updated = await this.collection.findOneAndUpdate(
      { id },
      { $set: changes },
      { ...WITHOUT_ID, returnDocument: 'after' },
    );
    if (!updated) throw new NotFoundError('Rule', id);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const { deletedCount } = await this.collection.deleteOne({ id });
    if (deletedCount === 0) throw new NotFoundError('Rule', id);
  }
}
