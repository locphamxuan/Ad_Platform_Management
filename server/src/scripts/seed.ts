import { env, seedPasswords } from '../config/env.js';
import { connectMongo } from '../db/mongo.js';
import { DEMO_PASSWORD, DEMO_USERS, seedDatabase } from '../seed.js';

const { client, db } = await connectMongo(env.MONGODB_URI, env.MONGODB_DB);
try {
  await seedDatabase(db, seedPasswords);
  // Never echo passwords that came from the environment; only the well-known dev default.
  const source = Object.keys(seedPasswords).length > 0 ? 'SEED_PASSWORD_* in server/.env' : DEMO_PASSWORD;
  console.log(`Seeded database "${env.MONGODB_DB}". Demo accounts (password: ${source}):`);
  console.table(DEMO_USERS);
} finally {
  await client.close();
}
