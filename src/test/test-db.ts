import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import path from 'path';

// Create a single shared database instance (file-based for persistence across module reloads)
// We use a worker-specific file to ensure isolation when running tests in parallel
const dbPath = path.resolve(process.cwd(), `test-${process.env.VITEST_WORKER_ID || '0'}.db`);

export const sqlite = new Database(dbPath);
export const testDb = drizzle(sqlite, { schema });
export const db = testDb;
export const closeTestDb = () => sqlite.close();
