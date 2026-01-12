import express from 'express';
import { sql, eq, desc } from 'drizzle-orm';
import { db } from '../database';
import { releases, deploymentEvents } from '../db/schema';

const router = express.Router();

import { getCertificate, getPrivateKey } from '../crypto';
import { config } from '../config';
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import { channels, assets, releases, deploymentEvents } from '../db/schema';
import { sql, eq, and } from 'drizzle-orm';

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Total releases
    const totalReleases = db.select({ count: sql<number>`count(*)` }).from(releases).get()?.count || 0;
    
    // Active releases
    const activeReleases = db.select({ count: sql<number>`count(*)` })
        .from(releases)
        .where(eq(releases.isActive, true))
        .get()?.count || 0;

    // Downloads last 24h
    const downloads24h = db.select({ count: sql<number>`count(*)` })
        .from(deploymentEvents)
        .where(and(
        eq(deploymentEvents.eventType, 'manifest_request'),
        sql`created_at >= ${last24h}`
        ))
        .get()?.count || 0;

    // Downloads last 7d
    const downloads7d = db.select({ count: sql<number>`count(*)` })
        .from(deploymentEvents)
        .where(and(
        eq(deploymentEvents.eventType, 'manifest_request'),
        sql`created_at >= ${last7d}`
        ))
        .get()?.count || 0;

    // Total downloads
    const totalDownloads = db.select({ count: sql<number>`count(*)` })
        .from(deploymentEvents)
        .where(eq(deploymentEvents.eventType, 'manifest_request'))
        .get()?.count || 0;

    // Errors last 24h
    const errors24h = db.select({ count: sql<number>`count(*)` })
        .from(deploymentEvents)
        .where(and(
        eq(deploymentEvents.eventType, 'update_error'),
        sql`created_at >= ${last24h}`
        ))
        .get()?.count || 0;

    // Storage used
    const storageBytes = db.select({ total: sql<number>`COALESCE(SUM(size_bytes), 0)` })
        .from(assets)
        .get()?.total || 0;

    // Downloads by platform
    const byPlatform = db.select({
        platform: deploymentEvents.expoPlatform,
        count: sql<number>`count(*)`
    })
    .from(deploymentEvents)
    .where(eq(deploymentEvents.eventType, 'manifest_request'))
    .groupBy(deploymentEvents.expoPlatform)
    .all();

    // Downloads by channel (via release)
    const byChannel = db.select({
        channel: releases.channel,
        count: sql<number>`count(*)`
    })
    .from(deploymentEvents)
    .innerJoin(releases, eq(deploymentEvents.releaseId, releases.id))
    .where(eq(deploymentEvents.eventType, 'manifest_request'))
    .groupBy(releases.channel)
    .all();

    // Certificate info
    let certificate = null;
    try {
        const certPem = getCertificate();
        const cert = forge.pki.certificateFromPem(certPem);
        certificate = {
            subject: cert.subject.getField('CN')?.value || 'Unknown',
            issuer: cert.issuer.getField('CN')?.value || 'Unknown',
            validFrom: cert.validity.notBefore.toISOString(),
            validTo: cert.validity.notAfter.toISOString(),
            daysRemaining: Math.ceil((cert.validity.notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
            fingerprint: forge.md.sha256.create()
                .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
                .digest().toHex().toUpperCase().match(/.{2}/g)?.join(':'),
        };
    } catch (e) {
        certificate = null;
    }

    res.json({
        releases: {
            total: totalReleases,
            active: activeReleases,
        },
        downloads: {
            total: totalDownloads,
            last24h: downloads24h,
            last7d: downloads7d,
            byPlatform: Object.fromEntries(byPlatform.map(p => [p.platform || 'unknown', p.count])),
            byChannel: Object.fromEntries(byChannel.map(c => [c.channel, c.count])),
        },
        errors: {
            last24h: errors24h,
        },
        storage: {
            usedBytes: storageBytes,
            usedMB: (storageBytes / 1024 / 1024).toFixed(2),
        },
        certificate,
        server: {
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            env: config.server.env,
        },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/health', async (req, res) => {
  const checks = {
    database: false,
    keys: false,
    storage: false,
  };

  // Check DB
  try {
    db.select({ one: sql`1` }).from(channels).limit(1).get();
    checks.database = true;
  } catch (e) {}

  // Check keys
  try {
    getPrivateKey();
    getCertificate();
    checks.keys = true;
  } catch (e) {}

  // Check storage writable
  try {
    const testFile = path.join(config.paths.dataDir, '.healthcheck');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    checks.storage = true;
  } catch (e) {}

  const healthy = Object.values(checks).every(Boolean);

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', (req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
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

// ... existing code ...

router.get('/activity', (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string || '50'), 100);
        const events = db.select().from(deploymentEvents)
            .orderBy(desc(deploymentEvents.createdAt))
            .limit(limit)
            .all();
        res.json(events);
    } catch (e) {
        next(e);
    }
});

router.get('/metrics', async (req, res, next) => {
    try {
        // Prometheus Format
        const totalReleases = db.select({ count: sql<number>`count(*)` }).from(releases).get()?.count || 0;
        const activeReleases = db.select({ count: sql<number>`count(*)` }).from(releases).where(eq(releases.isActive, true)).get()?.count || 0;
        
        const downloadsTotal = db.select({ count: sql<number>`count(*)` }).from(deploymentEvents).where(eq(deploymentEvents.eventType, 'manifest_request')).get()?.count || 0;
        const errorsTotal = db.select({ count: sql<number>`count(*)` }).from(deploymentEvents).where(eq(deploymentEvents.eventType, 'update_error')).get()?.count || 0;

        const metrics = [
            `# HELP expo_releases_total Total number of releases`,
            `# TYPE expo_releases_total gauge`,
            `expo_releases_total ${totalReleases}`,
            
            `# HELP expo_releases_active_total Total number of active releases`,
            `# TYPE expo_releases_active_total gauge`,
            `expo_releases_active_total ${activeReleases}`,

            `# HELP expo_downloads_total Total number of manifest downloads`,
            `# TYPE expo_downloads_total counter`,
            `expo_downloads_total ${downloadsTotal}`,

            `# HELP expo_errors_total Total number of client update errors`,
            `# TYPE expo_errors_total counter`,
            `expo_errors_total ${errorsTotal}`,
        ].join('\n');

        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (e) {
        next(e);
    }
});

router.get('/verify-assets', async (req, res, next) => {
    try {
        const allAssets = db.select().from(assets).all();
        const results = {
            total: allAssets.length,
            missing: [] as string[],
            corrupted: [] as string[],
        };

        const assetsBaseDir = path.join(config.paths.dataDir, 'assets');

        for (const asset of allAssets) {
            const assetPath = path.join(assetsBaseDir, asset.hash);
            if (!fs.existsSync(assetPath)) {
                results.missing.push(asset.hash);
                continue;
            }
            
            // Calculate hash to verify integrity (expensive for large DBs, be careful)
            // For now, just check existence or maybe size
            const stats = fs.statSync(assetPath);
            if (stats.size !== asset.sizeBytes) {
                results.corrupted.push(asset.hash);
            }
        }

        res.json({
            status: (results.missing.length === 0 && results.corrupted.length === 0) ? 'ok' : 'issues_found',
            ...results
        });
    } catch (e) {
        next(e);
    }
});

export default router;
