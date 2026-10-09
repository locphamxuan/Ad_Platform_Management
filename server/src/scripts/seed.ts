import { env } from '../config/env.js';
import { connectMongo } from '../db/mongo.js';
import { DEMO_PASSWORD, DEMO_USERS, seedDatabase } from '../seed.js';

const { client, db } = await connectMongo(env.MONGODB_URI, env.MONGODB_DB);
try {
  await seedDatabase(db);
  console.log(`Seeded database "${env.MONGODB_DB}". Demo accounts (password: ${DEMO_PASSWORD}):`);
  console.table(DEMO_USERS);
} finally {
  await client.close();
}
