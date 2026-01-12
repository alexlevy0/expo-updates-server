import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import * as schema from './db/schema';

const dbPath = path.join(config.paths.dataDir, 'expo-updates.db');

// Ensure data directory exists
if (!fs.existsSync(config.paths.dataDir)) {
  fs.mkdirSync(config.paths.dataDir, { recursive: true });
}

const client = new Database(dbPath, { create: true });
client.exec('PRAGMA journal_mode = WAL');

export const db = drizzle(client, { schema });

export function closeDb() {
  client.close();
}
