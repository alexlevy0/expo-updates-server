import express from 'express';
import path from 'node:path';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../database';
import { releases, assets, deploymentEvents } from '../db/schema';
import { signManifest, getCertificate } from '../crypto';
import { buildManifest } from '../manifest';
import { Release } from '../types';
import { config } from '../config';

const router = express.Router();

router.get('/api/manifest', (req, res, next) => {
  try {
    const platform = req.headers['expo-platform'] as string;
    const runtimeVersion = req.headers['expo-runtime-version'] as string;
    const channelName = (req.headers['expo-channel-name'] as string) || 'production';

    if (!platform || !runtimeVersion) {
       res.status(400).json({ error: 'Missing expo-platform or expo-runtime-version' });
       return;
    }

    if (platform !== 'ios' && platform !== 'android') {
        res.status(400).json({ error: 'Unsupported platform' });
        return;
    }

    // Find active release
    // Drizzle select returns array, we take first.
    const releaseList = db.select()
      .from(releases)
      .where(and(
        eq(releases.runtimeVersion, runtimeVersion),
        eq(releases.platform, platform),
        eq(releases.channel, channelName),
        eq(releases.isActive, true)
      ))
      .orderBy(desc(releases.createdAt))
      .limit(1)
      .all();

    const release = releaseList[0] as Release | undefined;

    if (!release) {
      // No update available or configured
      res.status(204).end();
      return;
    }

    const currentUpdateId = req.headers['expo-current-update-id'];
    if (currentUpdateId === release.id) {
       // Already has this update
       res.status(204).end();
       return;
    }

    // Build Manifest
    const manifest = buildManifest(release);
    const manifestString = JSON.stringify(manifest);
    const signature = signManifest(manifestString);
    const cert = getCertificate();

    // Headers
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('expo-signature', `sig="${signature}", keyid="main", alg="rsa-v1_5-sha256"`);
    // Headers cannot contain newlines, so we must sanitize the PEM or use a specific encoding.
    // Expo protocol expects the PEM content without newlines (whitespace separated is fine for some parsers, but single line is safest for HTTP headers).
    res.setHeader('expo-certificate-chain', cert.replace(/[\r\n]+/g, ' ').trim()); 
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, max-age=0');
    
    res.send(manifestString);

    // Async Log Event
    // We don't have transaction helper anymore, and here we don't strictly need one for a single insert, 
    // but the previous code used it. I'll skip explicit transaction for single insert.
    try {
        db.insert(deploymentEvents).values({
            releaseId: release.id,
            eventType: 'manifest_request',
            expoPlatform: platform,
            expoRuntimeVersion: runtimeVersion,
            clientIp: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        }).run();
    } catch (e) {
        console.error('Failed to log deployment event:', e);
    }

  } catch (error) {
    next(error);
  }
});

router.get('/assets/:hash', (req, res, next) => {
    try {
        const hash = req.params.hash;
        
        // Prevent Directory Traversal
        if (!/^[a-zA-Z0-9]+$/.test(hash)) {
            res.status(400).json({ error: 'Invalid asset hash' });
            return;
        }

        const asset = db.select().from(assets).where(eq(assets.hash, hash)).get();

        if (!asset) {
            res.status(404).json({ error: 'Asset not found' });
            return;
        }

        const filePath = path.join(config.paths.dataDir, 'assets', asset.filePath);
        
        res.setHeader('Content-Type', asset.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('ETag', hash);
        
        res.sendFile(filePath, (err) => {
            if (err) {
                 console.error('Error sending file:', err);
            }
        });

    } catch (error) {
        next(error);
    }
});

export default router;
