import { BSON, type Db, type Document } from 'mongodb';
import { COLLECTIONS } from './mongo.js';

const { EJSON } = BSON;

export interface DatabaseDump {
  format: 'adhub-backup/1';
  database: string;
  createdAt: string;
  collections: Record<string, Document[]>;
}

/** Snapshot of every AdHub collection; Extended JSON keeps dates and ObjectIds exact. */
export async function exportDatabase(db: Db): Promise<string> {
  const collections: Record<string, Document[]> = {};
  for (const name of Object.values(COLLECTIONS)) {
    collections[name] = await db.collection(name).find({}).toArray();
  }
  const dump: DatabaseDump = {
    format: 'adhub-backup/1',
    database: db.databaseName,
    createdAt: new Date().toISOString(),
    collections,
  };
  return EJSON.stringify(dump, { relaxed: false });
}

export function parseDump(text: string): DatabaseDump {
  const dump = EJSON.parse(text, { relaxed: false }) as DatabaseDump;
  if (dump?.format !== 'adhub-backup/1' || typeof dump.collections !== 'object') {
    throw new Error('Not an AdHub backup file');
  }
  return dump;
}

/** Replaces the content of each backed-up collection; returns the number of documents per collection. */
export async function importDatabase(db: Db, dump: DatabaseDump): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [name, documents] of Object.entries(dump.collections)) {
    const collection = db.collection(name);
    await collection.deleteMany({});
    if (documents.length > 0) await collection.insertMany(documents);
    counts[name] = documents.length;
  }
  return counts;
}

export async function countDocuments(db: Db): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of Object.values(COLLECTIONS)) counts[name] = await db.collection(name).countDocuments();
  return counts;
}
