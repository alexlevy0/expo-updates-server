import { beforeEach, beforeAll, afterAll, mock } from 'bun:test';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { sqlite, closeTestDb } from './test-db';
import fs from 'fs';
import path from 'path';

// Mock the real database module BEFORE importing it
mock.module('../database', () => {
    // Dynamic import to avoid hoisting issues, effectively returning the test-db exports
    return import('./test-db');
});

// Import db dynamically or just assume mock works for subsequent requires?
// Bun: "If the module has already been imported, it will be unloaded and re-imported the next time it is imported."
// So we can await import here.
const { db } = await import('../database');


try {
    const migrationDir = path.resolve(process.cwd(), 'drizzle');
    if (fs.existsSync(migrationDir)) {
        const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of files) {
            const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
            const statements = sql.split('--> statement-breakpoint');
            for (const statement of statements) {
                if (statement.trim()) {
                    sqlite.exec(statement);
                }
            }
        }
    }
} catch (e) {
    console.error('Failed to migrate test database:', e);
}

beforeEach(async () => {
    // Clean tables
    const tableNames = ['release_assets', 'deployment_events', 'releases', 'runtime_versions', 'channels', 'assets'];
    
    for (const table of tableNames) {
        db.run(sql.raw(`DELETE FROM ${table}`));
    }
    
    // Seed essential data
    db.insert(schema.channels).values([
         { name: 'production', description: 'Production' },
         { name: 'staging', description: 'Staging' }
    ]).run();
});

afterAll(() => {
    closeTestDb();
    const dbPath = path.resolve(process.cwd(), `test-${process.env.VITEST_WORKER_ID || '0'}.db`);
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
});
