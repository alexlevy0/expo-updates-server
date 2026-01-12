import express from 'express';
import { sql, eq, desc } from 'drizzle-orm';
import { db } from '../database';
import { releases, deploymentEvents } from '../db/schema';

const router = express.Router();

router.get('/', (req, res, next) => {
    try {
        // Drizzle doesn't have a simple .count() yet without sql hack for raw count(*) in simple driver wrapper sometimes?
        // Actually, db.select({ count: sql<number>`count(*)` }).from(...) works.
        
        const totalReleasesRes = db.select({ count: sql<number>`count(*)` }).from(releases).get();
        const activeReleasesRes = db.select({ count: sql<number>`count(*)` }).from(releases).where(eq(releases.isActive, true)).get();
        
        // OR filtering: Drizzle `or`.
        // "SELECT COUNT(*) as c FROM deployment_events WHERE event_type = 'asset_download' OR event_type = 'manifest_request'"
        const manifestRequestsRes = db.select({ count: sql<number>`count(*)` })
            .from(deploymentEvents)
            .where(eq(deploymentEvents.eventType, 'manifest_request'))
            .get();

        const errorsRes = db.select({ count: sql<number>`count(*)` })
            .from(deploymentEvents)
            .where(eq(deploymentEvents.eventType, 'update_error'))
            .get();

        res.json({
            totalReleases: totalReleasesRes?.count || 0,
            activeReleases: activeReleasesRes?.count || 0,
            totalDownloads: manifestRequestsRes?.count || 0,
            errors: errorsRes?.count || 0
        });
    } catch (e) {
        next(e);
    }
});

router.get('/releases/:id', (req, res, next) => {
    try {
        const events = db.select()
          .from(deploymentEvents)
          .where(eq(deploymentEvents.releaseId, req.params.id))
          .orderBy(desc(deploymentEvents.createdAt))
          .limit(100)
          .all();

        res.json(events);
    } catch (e) {
        next(e);
    }
});

export default router;
