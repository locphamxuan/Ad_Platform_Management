import { MongoClient, type Db } from 'mongodb';
import type {
  ActivityLog,
  Campaign,
  Integration,
  MetricDaily,
  Notification,
  Rule,
  Session,
  User,
  WorkspaceSettings,
} from '../domain/types.js';

export const COLLECTIONS = {
  integrations: 'integrations',
  campaigns: 'campaigns',
  metrics: 'metrics',
  rules: 'rules',
  activities: 'activities',
  users: 'users',
  sessions: 'sessions',
  settings: 'settings',
  notifications: 'notifications',
} as const;

export interface CollectionTypes {
  integrations: Integration;
  campaigns: Campaign;
  metrics: MetricDaily;
  rules: Rule;
  activities: ActivityLog;
  users: User;
  sessions: Session;
  settings: WorkspaceSettings;
  notifications: Notification;
}

/** Excludes Mongo's internal _id so domain objects stay storage-agnostic. */
export const WITHOUT_ID = { projection: { _id: 0 } } as const;

export async function connectMongo(uri: string, dbName: string) {
  // appName makes this client identifiable in Compass / `db.currentOp()`.
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, appName: 'adhub-server' });
  await client.connect();
  const db = client.db(dbName);
  await ensureIndexes(db);
  await migrateRetiredRoles(db);
  return { client, db };
}

/**
 * Retired roles are mapped onto the remaining ones so an existing database never holds a role the
 * server cannot resolve: read-only "viewer" becomes client, and "admin" (merged into owner) becomes owner.
 */
async function migrateRetiredRoles(db: Db): Promise<void> {
  const users = db.collection(COLLECTIONS.users);
  await users.updateMany({ role: 'viewer' }, { $set: { role: 'client' } });
  await users.updateMany({ role: 'admin' }, { $set: { role: 'owner' } });
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.integrations).createIndex({ platform: 1 }, { unique: true }),
    db.collection(COLLECTIONS.campaigns).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.campaigns).createIndex({ platform: 1, status: 1 }),
    db.collection(COLLECTIONS.metrics).createIndex({ campaignId: 1, date: 1 }, { unique: true }),
    db.collection(COLLECTIONS.metrics).createIndex({ date: 1 }),
    db.collection(COLLECTIONS.rules).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.activities).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.notifications).createIndex({ recipientId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.users).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ userId: 1 }),
    // TTL index: MongoDB deletes expired sessions by itself.
    db.collection(COLLECTIONS.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
