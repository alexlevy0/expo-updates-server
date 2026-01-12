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
import { releases, assets, releaseAssets } from '../db/schema';
import { sql, eq, and } from 'drizzle-orm';

const router = express.Router();
const upload = multer({ dest: path.join(config.paths.dataDir, 'tmp_uploads') });

// Helper to move file
function moveFile(src: string, dest: string) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
}

// POST /api/releases/upload
router.post('/upload', upload.single('bundle'), async (req, res, next) => {
    let zipPath: string | null = null;
    let tmpDir: string | null = null;

    try {
        const body = UploadReleaseSchema.parse(req.body);
        
        if (!req.file) {
            res.status(400).json({ error: 'Missing bundle file (ZIP)' });
            return;
        }

        zipPath = req.file.path;
        const zip = new AdmZip(zipPath);
        
        // Create tmp extraction dir
        tmpDir = path.join(config.paths.dataDir, 'tmp_extract_' + crypto.randomUUID());
        fs.mkdirSync(tmpDir, { recursive: true });
        zip.extractAllTo(tmpDir, true);

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
        const assetMappings: { hash: string, key: string, isLaunch: boolean }[] = [];

        // Launch Asset (Bundle)
        const bundlePathInZip = path.join(tmpDir, platformData.bundle);
        const bundleHash = await hashFile(bundlePathInZip); 
        
        const bundleDest = path.join(assetsBaseDir, bundleHash);
        if (!fs.existsSync(bundleDest)) {
             moveFile(bundlePathInZip, bundleDest);
             try {
                db.insert(assets).values({
                    hash: bundleHash,
                    filePath: bundleHash,
                    contentType: 'application/javascript',
                    fileExtension: '.js',
                    sizeBytes: fs.statSync(bundleDest).size
                }).onConflictDoNothing().run();
             } catch(e) {}
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
                     
                     try {
                        db.insert(assets).values({
                            hash: assetHash,
                            filePath: assetHash,
                            contentType: mime,
                            fileExtension: ext,
                            sizeBytes: fs.statSync(assetDest).size
                        }).onConflictDoNothing().run();
                     } catch(e) {}
                 }
                 assetMappings.push({ hash: assetHash, key: path.basename(assetRelPath), isLaunch: false });
            }
        }

        // 2. Create Release
        const releaseId = crypto.randomUUID();
        let manifestJson = '{}'; // Simplified for this implementation
        
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

        res.status(201).json({ success: true, releaseId });

    } catch (error) {
        next(error);
    } finally {
        if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

export default router;
