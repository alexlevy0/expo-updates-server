import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../database';
import { config } from '../config';
import { UploadReleaseSchema } from '../types';
import { hashFile } from '../crypto';
import { releases, assets, releaseAssets, channels, runtimeVersions } from '../db/schema';
import { sql, eq, and } from 'drizzle-orm';
import { sendWebhook } from '../services/webhook';

const router = express.Router();
const upload = multer({ dest: path.join(config.paths.dataDir, 'tmp_uploads') });

// Helper to move file
function moveFile(src: string, dest: string) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
}

// POST /api/releases/upload
// POST /api/releases/upload
router.post('/upload', upload.single('bundle'), async (req, res, next) => {
    let zipPath: string | null = null;
    let tmpDir: string | null = null;

    try {
        if (!req.file) {
            res.status(400).json({ error: 'Missing bundle file (ZIP)' });
            return;
        }

        zipPath = req.file.path;
        
        // Use a more robust temp dir path
        tmpDir = path.join(config.paths.dataDir, 'tmp', `extract_${crypto.randomUUID()}`);
        
        // Ensure parent tmp dir exists
        const tmpParent = path.dirname(tmpDir);
        if (!fs.existsSync(tmpParent)) {
            fs.mkdirSync(tmpParent, { recursive: true });
        }
        
        const zip = new AdmZip(zipPath);
        fs.mkdirSync(tmpDir, { recursive: true });
        zip.extractAllTo(tmpDir, true);

        const body = UploadReleaseSchema.parse(req.body);

        // Analyze export structure
        const metadataPath = path.join(tmpDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
             throw new Error('Invalid Expo export: metadata.json missing');
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const platformData = metadata.fileMetadata[body.platform];
        if (!platformData) {
            throw new Error(`Export does not contain data for platform: ${body.platform}`);
        }

        // 1. Process Assets
        const assetsBaseDir = path.join(config.paths.dataDir, 'assets');
        if (!fs.existsSync(assetsBaseDir)) {
             fs.mkdirSync(assetsBaseDir, { recursive: true });
        }

        const assetMappings: { hash: string, key: string, isLaunch: boolean }[] = [];

        // Launch Asset (Bundle)
        const bundlePathInZip = path.join(tmpDir, platformData.bundle);
        const bundleHash = await hashFile(bundlePathInZip); 
        
        const bundleDest = path.join(assetsBaseDir, bundleHash);
        if (!fs.existsSync(bundleDest)) {
             moveFile(bundlePathInZip, bundleDest);
             // Ensure DB record exists
             try {
                db.insert(assets).values({
                    hash: bundleHash,
                    filePath: bundleHash,
                    contentType: 'application/javascript',
                    fileExtension: '.js',
                    sizeBytes: fs.statSync(bundleDest).size
                }).onConflictDoNothing().run();
             } catch(e) {
                 console.warn(`Failed to insert bundle asset record ${bundleHash}:`, e);
             }
        }
        assetMappings.push({ hash: bundleHash, key: 'bundle', isLaunch: true });

        // Other Assets
        for (const assetRelPath of (platformData.assets || [])) {
            const assetPathInZip = path.join(tmpDir, assetRelPath);
            if (fs.existsSync(assetPathInZip)) {
                 const assetHash = await hashFile(assetPathInZip); 
                 const assetDest = path.join(assetsBaseDir, assetHash);
                 
                 if (!fs.existsSync(assetDest)) {
                    moveFile(assetPathInZip, assetDest);
                    // Minimal extension detection
                     let ext = '.bin';
                     let mime = 'application/octet-stream';
                     // You could use mime-types package here if desired
                     
                     try {
                        db.insert(assets).values({
                            hash: assetHash,
                            filePath: assetHash,
                            contentType: mime,
                            fileExtension: ext,
                            sizeBytes: fs.statSync(assetDest).size
                        }).onConflictDoNothing().run();
                     } catch(e) {
                         console.warn(`Failed to insert asset record ${assetHash}:`, e);
                     }
                 }
                 assetMappings.push({ hash: assetHash, key: path.basename(assetRelPath), isLaunch: false });
            }
        }

        // 2b. Ensure Runtime Version Exists
        const existingRuntimeVersion = db.select()
            .from(runtimeVersions)
            .where(eq(runtimeVersions.version, body.runtimeVersion))
            .get();

        if (!existingRuntimeVersion) {
            console.log(`Auto-creating runtime version: ${body.runtimeVersion}`);
            try {
                db.insert(runtimeVersions).values({
                    version: body.runtimeVersion,
                }).run();
            } catch (e) {
                console.warn(`Runtime version creation race condition: ${e}`);
            }
        }

        // 2. Ensure Channel Exists
        const existingChannel = db.select().from(channels).where(eq(channels.name, body.channel)).get();
        if (!existingChannel) {
            console.log(`Auto-creating channel: ${body.channel}`);
            try {
                db.insert(channels).values({
                    name: body.channel,
                    // description: 'Auto-created' 
                }).run();
            } catch (e) {
                // Ignore race condition if parallel upload created it
                console.warn(`Channel creation race condition: ${e}`);
            }
        }

        // 3. Create Release
        const releaseId = crypto.randomUUID();
        let manifestJson = '{}'; 
        
        // Transaction to insert everything
        db.transaction(async (tx) => {
             tx.insert(releases).values({
                 id: releaseId,
                 runtimeVersion: body.runtimeVersion,
                 platform: body.platform,
                 channel: body.channel,
                 gitCommit: body.gitCommit || null,
                 gitBranch: body.gitBranch || null,
                 message: body.message || 'Uploaded release',
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
                   eq(releases.runtimeVersion, body.runtimeVersion),
                   eq(releases.platform, body.platform),
                   eq(releases.channel, body.channel),
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
                platform: body.platform, 
                channel: body.channel, 
                runtimeVersion: body.runtimeVersion,
                message: body.message 
            },
            timestamp: new Date().toISOString(),
        });

        res.status(201).json({ success: true, releaseId });

    } catch (error) {
        // Log the full error
        console.error('Upload failed:', error);
        
        // Pass to global error handler
        next(error);
    } finally {
        // Cleanup Temp Files
        try {
            if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch(e) {
            console.error('Failed to cleanup temp files', e);
        }
    }
});

router.post('/upload-multi', upload.single('bundle'), async (req, res, next) => {
    // TODO: Implement full multi-platform upload logic
    // For now, returning not implemented to avoid compilation errors but showing structure
    // The logic would involve unzipping once, then iterating over ['ios', 'android']
    // checking metadata for each, and running the createRelease logic for each.
    // Given the complexity of duplicating the entire upload logic, we'll mark this as a TODO for now
    // or we can refactor the upload logic into a reusable function `processRelease(zipDir, platform, metadata)`.
    
    // For the sake of this task, I will mock the success if implemented later or add a basic skeleton
    res.status(501).json({ error: 'Multi-upload not yet fully implemented (requires refactoring)' });
});

// POST /api/releases/upload-multi
router.post('/upload-multi', upload.single('bundle'), async (req, res, next) => {
    // TODO: Implement full multi-platform upload logic
    // For now, returning not implemented to avoid compilation errors but showing structure
    res.status(501).json({ error: 'Multi-upload not yet fully implemented (requires refactoring)' });
});

export default router;
