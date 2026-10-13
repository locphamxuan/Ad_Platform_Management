import { MongoServerError, type Db } from 'mongodb';
import type { User } from '../domain/types.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import { COLLECTIONS, WITHOUT_ID } from '../db/mongo.js';

const DUPLICATE_KEY = 11000;

export class UserRepository {
  private readonly collection;

  constructor(db: Db) {
    this.collection = db.collection<User>(COLLECTIONS.users);
  }

  findAll(): Promise<User[]> {
    return this.collection.find({}, WITHOUT_ID).sort({ createdAt: 1 }).toArray();
  }

  findById(id: string): Promise<User | null> {
    return this.collection.findOne({ id }, WITHOUT_ID);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.collection.findOne({ email: email.toLowerCase() }, WITHOUT_ID);
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async insert(user: User): Promise<User> {
    await rejectDuplicateEmail(user.email, () => this.collection.insertOne({ ...user }));
    return user;
  }

  async update(id: string, changes: Partial<Omit<User, 'id'>>): Promise<User> {
    const normalized = changes.email ? { ...changes, email: changes.email.toLowerCase() } : changes;
    const updated = await rejectDuplicateEmail(normalized.email ?? '', () =>
      this.collection.findOneAndUpdate({ id }, { $set: normalized }, { ...WITHOUT_ID, returnDocument: 'after' }),
    );
    if (!updated) throw new NotFoundError('User', id);
    return updated;
  }
}

/** The unique email index is the source of truth; turn its error into a readable conflict. */
async function rejectDuplicateEmail<T>(email: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      throw new ConflictError(`Email "${email}" đã được sử dụng`);
    }
    throw error;
  }
}
