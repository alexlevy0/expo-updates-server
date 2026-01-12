import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import request from 'supertest';
import app from '../../server';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { db } from '../../database';
import { releases, assets, releaseAssets } from '../../db/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

// Helper to clean tables
async function cleanDb() {
    await db.delete(releaseAssets).run();
    await db.delete(releases).run();
    await db.delete(assets).run();
}

describe('Upload API', () => {
  let testZipPath: string;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(async () => {
    await cleanDb();
    
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create a minimal valid expo export ZIP
    const zip = new AdmZip();
    
    const metadata = {
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        ios: {
          bundle: 'bundles/ios-abc123.js',
          assets: [
              { path: 'assets/image.png', ext: 'png' } // Simplified structure for test simulation or use proper array of strings if code expects paths
          ],
        },
      },
    };
    // Fix metadata structure based on server expectations
    // Server expects: const assetRelPath of (platformData.assets || []) -> assumes array of strings (relative paths)
    // Adjust metadata:
    const validMetadata = {
        version: 0,
        bundler: 'metro',
        fileMetadata: {
          ios: {
            bundle: 'bundles/ios-bundle.js',
            assets: ['assets/image.png']
          }
        }
    };
    
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(validMetadata)));
    zip.addFile('bundles/ios-bundle.js', Buffer.from('console.log("bundle");'));
    zip.addFile('assets/image.png', Buffer.from('fake image content'));
    
    testZipPath = path.join(fixturesDir, 'test-export.zip');
    zip.writeZip(testZipPath);
  });

  afterEach(async () => {
    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
    await cleanDb();
  });

  it('POST /api/releases/upload accepts valid ZIP', async () => {
    const res = await request(app)
      .post('/api/releases/upload')
      .attach('bundle', testZipPath)
      .field('platform', 'ios')
      .field('runtimeVersion', '1.0.0')
      .field('channel', 'production');

    // Note: If rate limiter is active and sharing state, tests might hit it.
    // In test env, we might want to disable rate limiter or mock it.
    // But bun:test isolation usually handles reset.
    // Also ensuring auth is handled if enabled?
    // Config defaults dashboard auth to false, so it should be open unless overridden.

    expect(res.status).toBe(201);
    expect(res.body.releaseId).toBeDefined();
    
    // Verify DB
    const release = await db.select().from(releases).where(sql`id = ${res.body.releaseId}`).get();
    expect(release).toBeDefined();
    expect(release.platform).toBe('ios');
    expect(release.runtimeVersion).toBe('1.0.0');
    expect(release.isActive).toBe(true); // Should be auto-activated
    
    // Verify Assets
    const bundleAsset = await db.select().from(assets).where(sql`hash = ${release.bundlePath}`).get();
    expect(bundleAsset).toBeDefined();
  });

  it('POST /api/releases/upload rejects invalid ZIP content', async () => {
    const res = await request(app)
      .post('/api/releases/upload')
      .attach('bundle', Buffer.from('not a zip'), 'fake.zip')
      .field('platform', 'ios')
      .field('runtimeVersion', '1.0.0')
      .field('channel', 'production');

    expect(res.status).toBe(500); // AdmZip throws on invalid zip, caught by global error handler
    // Or 400 if we handled it explicitly, but currently it might throw in AdmZip constructor or extract.
    // The robust implementation prints error and calls next(error).
  });

  it('POST /api/releases/upload requires platform match', async () => {
    const res = await request(app)
      .post('/api/releases/upload')
      .attach('bundle', testZipPath)
      .field('platform', 'android') // Zip has ios data
      .field('runtimeVersion', '1.0.0')
      .field('channel', 'production');

    expect(res.status).toBe(500); // "Export does not contain data for platform: android"
  });
  
  it('POST /api/releases/upload validates schema', async () => {
     const res = await request(app)
      .post('/api/releases/upload')
      .attach('bundle', testZipPath)
      // Missing fields
      .field('platform', 'ios');
      
     expect(res.status).toBe(400); // Zod validation error
  });
});
