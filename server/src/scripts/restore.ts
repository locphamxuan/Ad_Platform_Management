import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { env } from '../config/env.js';
import { importDatabase, parseDump } from '../db/backup.js';
import { connectMongo } from '../db/mongo.js';

/**
 * Usage: node --env-file=.env dist/scripts/restore.js <backup.json.gz> [--into <database>] [--yes]
 * Restores into another database by default-safe rules: overwriting the configured MONGODB_DB
 * (the one the server is using) requires --yes, and the server should be stopped first.
 */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--into');
const intoIndex = args.indexOf('--into');
const target = intoIndex >= 0 ? args[intoIndex + 1] : env.MONGODB_DB;

if (!file || !target) {
  console.error('Usage: restore.js <backup.json.gz> [--into <database>] [--yes]');
  process.exit(1);
}
if (target === env.MONGODB_DB && !args.includes('--yes')) {
  console.error(`Refusing to overwrite the live database "${target}" without --yes (stop the server first).`);
  process.exit(1);
}

const raw = await readFile(file);
const dump = parseDump((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
const { client, db } = await connectMongo(env.MONGODB_URI, target);
try {
  const counts = await importDatabase(db, dump);
  console.log(`Restored backup of "${dump.database}" taken ${dump.createdAt} into "${target}":`);
  console.table(counts);
} finally {
  await client.close();
}
