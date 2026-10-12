import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { env } from '../config/env.js';
import { countDocuments, exportDatabase } from '../db/backup.js';
import { connectMongo } from '../db/mongo.js';

/**
 * Usage: node --env-file=.env dist/scripts/backup.js [outDir] [keep]
 * Writes <outDir>/<db>_<timestamp>.json.gz and keeps only the newest `keep` backups (default 14).
 * Backups contain password hashes: store them outside shared folders.
 */
const outDir = path.resolve(process.argv[2] ?? 'backups');
const keep = Number(process.argv[3] ?? 14);

const { client, db } = await connectMongo(env.MONGODB_URI, env.MONGODB_DB);
try {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const file = path.join(outDir, `${env.MONGODB_DB}_${stamp}.json.gz`);
  await mkdir(outDir, { recursive: true });
  await writeFile(file, gzipSync(await exportDatabase(db)));
  console.log(`Backup written: ${file}`);
  console.table(await countDocuments(db));

  const prefix = `${env.MONGODB_DB}_`;
  const backups = (await readdir(outDir)).filter((f) => f.startsWith(prefix) && f.endsWith('.json.gz')).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    await rm(path.join(outDir, old));
    console.log(`Removed old backup: ${old}`);
  }
} finally {
  await client.close();
}
