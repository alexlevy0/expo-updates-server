import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { db } from '../../database';
import { releases, assets, releaseAssets } from '../../db/schema';
import crypto from 'crypto';

// Setup is handled by setup.ts (mocking db) via vitest config or imported side-effect?
// We need to configure vitest to use setup file.
// For now, let's assume valid mock via manual mock or verify `vi.mock` works if this file imports it.
// Actually, `src/test/setup.ts` must be included in `setupFiles` in vitest config or imported.
// I will blindly overwrite `vitest.config.ts` or similar next.



describe('Expo Protocol Endpoints', () => {

    it('GET /api/manifest returns 400 for missing headers', async () => {
        const res = await request(app).get('/api/manifest');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing');
    });

    it('GET /api/manifest returns 204 if no active release', async () => {
        const res = await request(app)
            .get('/api/manifest')
            .set('expo-platform', 'ios')
            .set('expo-runtime-version', '1.0.0')
            .set('expo-channel-name', 'production');
        
        expect(res.status).toBe(204);
    });

    it('GET /api/manifest returns signed manifest for active release', async () => {
        // Seed Data
        const bundleHash = 'hash-bundle';
        // Insert Asset
        db.insert(assets).values({
            hash: bundleHash,
            filePath: bundleHash,
            contentType: 'application/javascript',
            fileExtension: '.js',
            sizeBytes: 100
        }).run();

        // Insert Release
        const releaseId = crypto.randomUUID();
        db.insert(releases).values({
            id: releaseId,
            runtimeVersion: '1.0.0',
            platform: 'ios',
            channel: 'production',
            bundlePath: bundleHash,
            manifestJson: '{}',
            isActive: true
        }).run();

        // Join
        db.insert(releaseAssets).values({
            releaseId,
            assetHash: bundleHash,
            assetKey: 'bundle',
            isLaunchAsset: true
        }).run();


        const res = await request(app)
            .get('/api/manifest')
            .set('expo-platform', 'ios')
            .set('expo-runtime-version', '1.0.0')
            .set('expo-channel-name', 'production');
        
        expect(res.status).toBe(200);
        expect(res.headers['expo-protocol-version']).toBe('1');
        expect(res.headers['expo-signature']).toBeDefined();
        
        const manifest = JSON.parse(res.text);
        expect(manifest.id).toBe(releaseId);
        expect(manifest.launchAsset.hash).toBe(bundleHash);
    });
});
