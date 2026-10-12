import type { Server } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app.js';
import { env, metaConfig, seedPasswords } from './config/env.js';
import { createContainer } from './container.js';
import { connectMongo } from './db/mongo.js';
import { startAutomationScheduler } from './jobs/automation-scheduler.js';
import { seedIfEmpty } from './seed.js';

/** Resolves once the port is bound; rejects (instead of crashing) on e.g. EADDRINUSE. */
function listen(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function describeStartupError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') {
    return (
      `Port ${env.PORT} is already in use — another AdHub/Node process is probably still running.\n` +
      `  Find it:  Get-NetTCPConnection -LocalPort ${env.PORT} -State Listen   (Windows)\n` +
      `            lsof -i :${env.PORT}                                     (macOS/Linux)\n` +
      `  Then stop that process, or set a different PORT in server/.env.`
    );
  }
  if (code === 'EACCES') return `No permission to bind port ${env.PORT}; choose a port above 1024.`;
  return error instanceof Error ? error.message : String(error);
}

const { client, db } = await connectMongo(env.MONGODB_URI, env.MONGODB_DB).catch((error) => {
  console.error(
    `[startup] Cannot connect to MongoDB at ${env.MONGODB_URI} (${(error as Error).message}).\n` +
      `  Start it with: docker compose up -d`,
  );
  process.exit(1);
});
console.log(`MongoDB connected: ${env.MONGODB_URI} (database "${env.MONGODB_DB}")`);
console.log(
  metaConfig
    ? `Facebook: Meta Marketing API ${metaConfig.apiVersion}, ad account ${metaConfig.adAccountId}`
    : 'Facebook: mock adapter (no Meta credentials)',
);
const container = createContainer(db);

let server: Server;
try {
  const seeded = await seedIfEmpty(db, seedPasswords);
  if (seeded) console.log(seeded);
  server = await listen(createApp(container, { clientDist: env.CLIENT_DIST }), env.PORT);
} catch (error) {
  console.error(`[startup] ${describeStartupError(error)}`);
  await client.close();
  process.exit(1);
}

// Start background automation only once the API is actually serving.
const scheduler = startAutomationScheduler(container);
console.log(
  `AdHub API listening on http://localhost:${env.PORT}` + (env.CLIENT_DIST ? ` (serving client from ${env.CLIENT_DIST})` : ''),
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, closing…`);
  scheduler.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await client.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
