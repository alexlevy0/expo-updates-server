import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config';
import { UploadReleaseSchema } from '../types';
import { releaseService } from '../services/ReleaseService';

const router = express.Router();
const upload = multer({ dest: path.join(config.paths.dataDir, 'tmp_uploads') });

// POST /api/releases/upload
router.post('/upload', upload.single('bundle'), async (req, res, next) => {
    let zipPath: string | null = null;

    try {
        if (!req.file) {
            res.status(400).json({ error: 'Missing bundle file (ZIP)' });
            return;
        }

        zipPath = req.file.path;
        const body = UploadReleaseSchema.parse(req.body);

        const releaseId = await releaseService.processUpload(zipPath, {
            platform: body.platform,
            runtimeVersion: body.runtimeVersion,
            channel: body.channel,
            gitCommit: body.gitCommit,
            gitBranch: body.gitBranch,
            message: body.message
        });

        res.status(201).json({ success: true, releaseId });

    } catch (error) {
        next(error);
    } finally {
        // Cleanup Uploaded ZIP
        if (zipPath && fs.existsSync(zipPath)) {
            try { fs.unlinkSync(zipPath); } catch (e) {}
        }
    }
});

// POST /api/releases/upload-multi
router.post('/upload-multi', upload.single('bundle'), async (req, res, next) => {
    // TODO: Implement full multi-platform upload using releaseService
    // Logic: Unzip once, call releaseService.processUpload (logic needs adaptation to accept directory or we unzip inside and pass metadata for each platform)
    res.status(501).json({ error: 'Multi-upload not yet fully implemented (requires refactoring ReleaseService to accept pre-extracted dir or zip sharing)' });
});

export default router;
