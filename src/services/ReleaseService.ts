import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import { db } from '../database';
import { config } from '../config';
import { releases, assets, releaseAssets, channels, runtimeVersions } from '../db/schema';
import { sql, eq, and } from 'drizzle-orm';
import { hashFile } from '../crypto';
import { sendWebhook } from './webhook';

export class ReleaseService {
  /**
   * Process a release upload (ZIP bundle)
   */
  async processUpload(
    zipPath: string,
    params: {
        platform: 'ios' | 'android';
        runtimeVersion: string;
        channel: string;
        gitCommit?: string;
        gitBranch?: string;
        message?: string;
    }
  ): Promise<string> {
    const tmpDir = path.join(config.paths.dataDir, 'tmp', `extract_${crypto.randomUUID()}`);
    
    try {
        // Ensure parent tmp dir exists
        fs.mkdirSync(path.dirname(tmpDir), { recursive: true });
        
        const zip = new AdmZip(zipPath);
        fs.mkdirSync(tmpDir, { recursive: true });
        zip.extractAllTo(tmpDir, true);

        // Analyze export structure
        const metadataPath = path.join(tmpDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
             throw new Error('Invalid Expo export: metadata.json missing');
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const platformData = metadata.fileMetadata[params.platform];
        if (!platformData) {
            throw new Error(`Export does not contain data for platform: ${params.platform}`);
        }

        // 1. Process Assets
        const assetsBaseDir = path.join(config.paths.dataDir, 'assets');
        fs.mkdirSync(assetsBaseDir, { recursive: true });

        const assetMappings: { hash: string, key: string, isLaunch: boolean }[] = [];

        // Launch Asset (Bundle)
        const bundlePathInZip = path.join(tmpDir, platformData.bundle);
        const bundleHash = await hashFile(bundlePathInZip); 
        await this.ensureAssetExists(bundlePathInZip, bundleHash, '.js', 'application/javascript', assetsBaseDir);
        assetMappings.push({ hash: bundleHash, key: 'bundle', isLaunch: true });

        // Other Assets
        for (const assetRelPath of (platformData.assets || [])) {
            const assetPathInZip = path.join(tmpDir, assetRelPath);
            if (fs.existsSync(assetPathInZip)) {
                 const assetHash = await hashFile(assetPathInZip); 
                 await this.ensureAssetExists(assetPathInZip, assetHash, '.bin', 'application/octet-stream', assetsBaseDir);
                 assetMappings.push({ hash: assetHash, key: path.basename(assetRelPath), isLaunch: false });
            }
        }

        // 2. Ensure Runtime Version & Channel Exist (with Concurrency Protection)
        await this.ensureRuntimeVersion(params.runtimeVersion);
        await this.ensureChannel(params.channel);

        // 3. Create Release
        const releaseId = crypto.randomUUID();
        const manifestJson = '{}'; 
        
        // Transaction to insert everything
        db.transaction((tx) => {
             tx.insert(releases).values({
                 id: releaseId,
                 runtimeVersion: params.runtimeVersion,
                 platform: params.platform,
                 channel: params.channel,
                 gitCommit: params.gitCommit || null,
                 gitBranch: params.gitBranch || null,
                 message: params.message || 'Uploaded release',
                 isActive: false, 
                 bundlePath: bundleHash,
                 manifestJson: manifestJson
             }).run();

             for (const m of assetMappings) {
                 tx.insert(releaseAssets).values({
                     releaseId: releaseId,
                     assetHash: m.hash,
                     assetKey: m.key,
                     isLaunchAsset: m.isLaunch ? true : false
                 }).run();
             }

             // Automatic Activation logic
             tx.update(releases)
               .set({ isActive: false, deactivatedAt: sql`CURRENT_TIMESTAMP` })
               .where(and(
                   eq(releases.runtimeVersion, params.runtimeVersion),
                   eq(releases.platform, params.platform),
                   eq(releases.channel, params.channel),
                   eq(releases.isActive, true)
               )).run();
             
             tx.update(releases)
               .set({ isActive: true, activatedAt: sql`CURRENT_TIMESTAMP` })
               .where(eq(releases.id, releaseId))
               .run();
        });

        // Trigger Webhook
        await sendWebhook({
            event: 'release.created',
            release: { 
                id: releaseId, 
                platform: params.platform, 
                channel: params.channel, 
                runtimeVersion: params.runtimeVersion,
                message: params.message 
            },
            timestamp: new Date().toISOString(),
        });

        return releaseId;

    } finally {
        // Cleanup Temp Files
        try {
            if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch(e) {
            console.error('Failed to cleanup temp dir', e);
        }
    }
  }

  private async ensureAssetExists(srcPath: string, hash: string, ext: string, mime: string, destDir: string) {
      const destPath = path.join(destDir, hash);
      if (!fs.existsSync(destPath)) {
          // Move file (rename)
          // Ensure directory exists (already done by caller ideally but safe to repeat)
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.renameSync(srcPath, destPath);
          
          // DB Insert with ON CONFLICT DO NOTHING
          try {
             db.insert(assets).values({
                 hash: hash,
                 filePath: hash,
                 contentType: mime,
                 fileExtension: ext,
                 sizeBytes: fs.statSync(destPath).size
             }).onConflictDoNothing().run();
          } catch(e) {
              console.warn(`Failed to insert asset record ${hash}:`, e);
          }
      }
  }

  private async ensureRuntimeVersion(version: string) {
      try {
          db.insert(runtimeVersions).values({ version }).onConflictDoNothing().run();
      } catch (e) {
          console.warn(`Runtime version upsert error: ${e}`);
      }
  }

  private async ensureChannel(name: string) {
      try {
          db.insert(channels).values({ name }).onConflictDoNothing().run();
      } catch (e) {
           console.warn(`Channel upsert error: ${e}`);
      }
  }
}

export const releaseService = new ReleaseService();
