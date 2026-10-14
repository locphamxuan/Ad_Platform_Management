import type { Db } from 'mongodb';
import type { CampaignDraft, CampaignDraftState } from '../domain/types.js';
import { NotFoundError } from '../domain/errors.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

export class CampaignDraftRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<CampaignDraft>(COLLECTIONS.campaign_drafts);
  }

  async findById(id: string): Promise<CampaignDraft | null> {
    return this.collection.findOne({ id }, WITHOUT_ID);
  }

  async getById(id: string): Promise<CampaignDraft> {
    const draft = await this.findById(id);
    if (!draft) throw new NotFoundError('CampaignDraft', id);
    return draft;
  }

  async findByOwner(ownerId: string): Promise<CampaignDraft[]> {
    return this.collection.find({ ownerId }, WITHOUT_ID).sort({ updatedAt: -1 }).toArray();
  }

  async findAll(): Promise<CampaignDraft[]> {
    return this.collection.find({}, WITHOUT_ID).sort({ updatedAt: -1 }).toArray();
  }

  async insert(draft: CampaignDraft): Promise<CampaignDraft> {
    await this.collection.insertOne({ ...draft });
    return draft;
  }

  /**
   * Optimistic concurrency update: only updates if the current revision matches expectedRevision.
   * Increments revision by 1. Returns null on revision conflict (409).
   */
  async updateWithRevision(
    id: string,
    expectedRevision: number,
    changes: Partial<CampaignDraft>,
  ): Promise<CampaignDraft | null> {
    const now = new Date().toISOString();
    const { revision, id: _, ownerId: __, ...safeChanges } = changes;
    const result = await this.collection.findOneAndUpdate(
      { id, revision: expectedRevision },
      {
        $set: { ...safeChanges, updatedAt: now },
        $inc: { revision: 1 },
      },
      { ...WITHOUT_ID, returnDocument: 'after' },
    );
    return result;
  }

  /**
   * Atomic state transition: only transitions if the current state matches expectedState.
   * Increments revision. Returns null on conflict.
   */
  async updateState(
    id: string,
    expectedState: CampaignDraftState,
    newState: CampaignDraftState,
    extraChanges: Partial<CampaignDraft> = {},
  ): Promise<CampaignDraft | null> {
    const now = new Date().toISOString();
    const result = await this.collection.findOneAndUpdate(
      { id, state: expectedState },
      {
        $set: { ...extraChanges, state: newState, updatedAt: now },
        $inc: { revision: 1 },
      },
      { ...WITHOUT_ID, returnDocument: 'after' },
    );
    return result;
  }

  async update(id: string, changes: Partial<CampaignDraft>): Promise<CampaignDraft> {
    const now = new Date().toISOString();
    const result = await this.collection.findOneAndUpdate(
      { id },
      {
        $set: { ...changes, updatedAt: now },
      },
      { ...WITHOUT_ID, returnDocument: 'after' },
    );
    if (!result) throw new NotFoundError('CampaignDraft', id);
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ id });
    return res.deletedCount > 0;
  }

  /**
   * Finds drafts stuck in SUBMITTING state for longer than thresholdMinutes.
   */
  async findStuckSubmitting(thresholdMinutes = 5): Promise<CampaignDraft[]> {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
    return this.collection
      .find(
        {
          state: 'SUBMITTING',
          'submission.startedAt': { $lt: cutoff },
        },
        WITHOUT_ID,
      )
      .toArray();
  }
}

