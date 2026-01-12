import { db } from '../src/database';
import { releases } from '../src/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';

const DAYS_TO_KEEP = parseInt(process.argv[2] || '30');

if (isNaN(DAYS_TO_KEEP)) {
    console.error('Invalid number of days specified.');
    process.exit(1);
}

async function purgeOldReleases() {
    console.log(`Finding inactive releases older than ${DAYS_TO_KEEP} days...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP);

    try {
        // Find candidates
        const candidates = db.select({ id: releases.id, createdAt: releases.createdAt })
            .from(releases)
            .where(and(
                eq(releases.isActive, false),
                lt(releases.createdAt, cutoffDate.toISOString())
            ))
            .all();

        if (candidates.length === 0) {
            console.log('No old inactive releases found.');
            return;
        }

        console.log(`Found ${candidates.length} releases to purge.`);

        // Delete
        // SQLite DELETE with limit is not standard in generic SQL, but we can delete by ID list or just let it rip
        // Drizzle doesn't support 'inArray' for delete easily in all drivers without subquery, 
        // but simple where clause works.
        
        const result = db.delete(releases)
            .where(and(
                eq(releases.isActive, false),
                lt(releases.createdAt, cutoffDate.toISOString())
            ))
            .run();
        
        console.log(`Purge completed.`);
        console.log('Run "npm run list:assets" or "npm run gc" to clean up orphaned assets.');

    } catch (error) {
        console.error('Error purging releases:', error);
    }
}

purgeOldReleases();
