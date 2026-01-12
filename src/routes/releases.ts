import express from 'express';
import { db } from '../database';
import { Release, PaginatedResponse } from '../types';
import { releases, releaseAssets, assets } from '../db/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { sendWebhook } from '../services/webhook';

const router = express.Router();

// List Releases
router.get('/', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '10'), 100);
    const offset = parseInt(req.query.offset as string || '0');
    const platform = req.query.platform as string;
    const channel = req.query.channel as string;

    const filters = [];
    if (platform) filters.push(eq(releases.platform, platform));
    if (channel) filters.push(eq(releases.channel, channel));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const releaseData = db.select().from(releases)
        .where(whereClause)
        .orderBy(desc(releases.createdAt))
        .limit(limit)
        .offset(offset)
        .all();

    const countRes = db.select({ count: count() })
        .from(releases)
        .where(whereClause)
        .get();

    const response: PaginatedResponse<Release> = {
        data: releaseData as Release[],
        meta: { 
            total: countRes?.count || 0,
            limit, 
            offset 
        }
    };

    res.json(response);

  } catch (error) {
    next(error);
  }
});

router.get('/:id', (req, res, next) => {
    try {
        const release = db.select().from(releases).where(eq(releases.id, req.params.id)).get() as Release | undefined;
        if (!release) {
            res.status(404).json({ error: 'Release not found' });
            return;
        }
        res.json(release);
    } catch (error) {
        next(error);
    }
});

// Update Status / Actions
router.post('/:id/:action', async (req, res, next) => {
    try {
        const { id, action } = req.params;
        const release = db.select().from(releases).where(eq(releases.id, id)).get() as Release | undefined;

        if (!release) {
             res.status(404).json({ error: 'Release not found' });
             return;
        }

        if (action === 'activate') {
            db.transaction(async (tx) => {
                // Deactivate others
                tx.update(releases)
                  .set({ isActive: false, deactivatedAt: sql`CURRENT_TIMESTAMP` })
                  .where(and(
                      eq(releases.runtimeVersion, release.runtimeVersion),
                      eq(releases.platform, release.platform),
                      eq(releases.channel, release.channel),
                      eq(releases.isActive, true)
                  )).run();
                
                // Activate this
                tx.update(releases)
                  .set({ isActive: true, activatedAt: sql`CURRENT_TIMESTAMP` })
                  .where(eq(releases.id, id))
                  .run();
            });
            res.json({ success: true, message: 'Release activated' });
        } else if (action === 'deactivate') {
             db.update(releases)
               .set({ isActive: false, deactivatedAt: sql`CURRENT_TIMESTAMP` })
               .where(eq(releases.id, id))
               .run();
             res.json({ success: true, message: 'Release deactivated' });
        } else if (action === 'rollback') {
            // Rollback implementation: Create new release pointing to same assets
            
            const newId = crypto.randomUUID();
            db.transaction(async (tx) => {
                // Deactivate current active
                tx.update(releases)
                  .set({ isActive: false })
                  .where(and(
                      eq(releases.runtimeVersion, release.runtimeVersion),
                      eq(releases.platform, release.platform),
                      eq(releases.channel, release.channel),
                      eq(releases.isActive, true)
                  )).run();
                
                // Copy release
                // We must read old values properly first? release var has them.
                tx.insert(releases).values({
                    id: newId,
                    runtimeVersion: release.runtimeVersion,
                    platform: release.platform,
                    channel: release.channel,
                    gitCommit: release.gitCommit,
                    gitBranch: release.gitBranch,
                    message: `Rollback to ${id}`,
                    isActive: true,
                    isRollback: true,
                    rollbackFromId: id,
                    bundlePath: release.bundlePath,
                    manifestJson: release.manifestJson,
                    createdAt: sql`CURRENT_TIMESTAMP`,
                    activatedAt: sql`CURRENT_TIMESTAMP`
                }).run();

                // Copy asset links
                const existingAssets = tx.select().from(releaseAssets).where(eq(releaseAssets.releaseId, id)).all();
                
                for (const asset of existingAssets) {
                    tx.insert(releaseAssets).values({
                        releaseId: newId,
                        assetHash: asset.assetHash,
                        assetKey: asset.assetKey,
                        isLaunchAsset: asset.isLaunchAsset
                    }).run();
                }
            });

            // Trigger Webhook for Rollback
            await sendWebhook({
                event: 'release.rollback',
                release: { 
                    id: newId, 
                    rollbackFromId: id,
                    platform: release.platform, 
                    channel: release.channel, 
                    runtimeVersion: release.runtimeVersion,
                    message: `Rollback to ${id}`
                },
                timestamp: new Date().toISOString(),
            });
            
            res.json({ success: true, newReleaseId: newId });

        } else {
            res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        next(error);
    }
});

router.delete('/:id', (req, res, next) => {
     try {
        db.delete(releases).where(eq(releases.id, req.params.id)).run();
        res.json({ success: true });
     } catch (error) {
         next(error);
     }
});

export default router;
