import { MongoClient } from 'mongodb';
import { afterAll, describe, expect, it } from 'vitest';
import { countDocuments, exportDatabase, importDatabase, parseDump } from '../src/db/backup.js';
import { connectMongo } from '../src/db/mongo.js';
import { seedDatabase } from '../src/seed.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const prefix = `${process.env.TEST_DB_PREFIX ?? 'adhub_test'}_${process.pid}`;
const SOURCE = `${prefix}_backup_src`;
const TARGET = `${prefix}_backup_dst`;

async function isMongoReachable(): Promise<boolean> {
  const probe = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 1500 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.close();
  }
}

const mongoUp = await isMongoReachable();

describe.skipIf(!mongoUp)('database backup and restore', () => {
  const clients: MongoClient[] = [];

  afterAll(async () => {
    for (const client of clients) {
      await client.db(SOURCE).dropDatabase();
      await client.db(TARGET).dropDatabase();
      await client.close();
    }
  });

  it('restores an exact copy, dates included, replacing what was there', async () => {
    const source = await connectMongo(MONGODB_URI, SOURCE);
    const target = await connectMongo(MONGODB_URI, TARGET);
    clients.push(source.client, target.client);
    await seedDatabase(source.db);
    await target.db.collection('rules').insertOne({ id: 'stale', name: 'should disappear' });

    const dump = parseDump(await exportDatabase(source.db));
    await importDatabase(target.db, dump);

    expect(await countDocuments(target.db)).toEqual(await countDocuments(source.db));
    expect(await target.db.collection('rules').findOne({ id: 'stale' })).toBeNull();
    const session = await source.db.collection('sessions').findOne({});
    if (session) {
      const restored = await target.db.collection('sessions').findOne({ tokenHash: session.tokenHash });
      expect(restored?.expiresAt).toBeInstanceOf(Date);
    }
  });

  it('rejects files that are not AdHub backups', () => {
    expect(() => parseDump('{"hello":"world"}')).toThrow('Not an AdHub backup file');
  });
});
