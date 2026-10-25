import mongoose from "mongoose";

let txSupport: boolean | null = null;

/**
 * Multi-document transactions need a replica set / mongos (Atlas in production).
 * A standalone local mongod (common in dev) does not support them, so financial
 * routes degrade to sequential writes with compensating checks instead of crashing.
 */
export async function supportsTransactions(): Promise<boolean> {
  if (txSupport !== null) return txSupport;
  try {
    const db = mongoose.connection.db;
    if (!db) return (txSupport = false);
    const hello = await db.admin().command({ hello: 1 });
    txSupport = !!hello.setName;
  } catch {
    txSupport = false;
  }
  return txSupport;
}

/**
 * Run fn inside a MongoDB transaction when the server supports them;
 * otherwise run it directly with session = null.
 */
export async function withTx<T>(fn: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T> {
  if (!(await supportsTransactions())) {
    return fn(null);
  }
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
