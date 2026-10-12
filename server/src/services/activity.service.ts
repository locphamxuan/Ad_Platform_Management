import { randomUUID } from 'node:crypto';
import type { ActivityActor, ActivityLog, PublicUser } from '../domain/types.js';
import type { ActivityRepository } from '../repositories/activity.repository.js';

export interface Actor {
  type: ActivityActor;
  name: string;
  id?: string;
}

export const SYSTEM_ACTOR: Actor = { type: 'system', name: 'Hệ thống' };

export const userActor = (user: PublicUser): Actor => ({ type: 'user', name: user.name, id: user.id });

export class ActivityService {
  constructor(private readonly activities: ActivityRepository) {}

  async log(actor: Actor, message: string, campaignId?: string): Promise<void> {
    await this.activities.insert({
      id: randomUUID(),
      actor: actor.type,
      actorName: actor.name,
      actorId: actor.id,
      message,
      campaignId,
      createdAt: new Date().toISOString(),
    });
  }

  listRecent(limit = 100): Promise<ActivityLog[]> {
    return this.activities.findRecent(limit);
  }
}
