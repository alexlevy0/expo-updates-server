import { db } from '../src/database';
import { assets, releaseAssets } from '../src/db/schema';
import { notInArray, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { config } from '../src/config';

async function garbageCollect() {
  console.log('🗑️  Starting asset garbage collection...');

  // Find orphan assets (not in any release)
  // We need to get all asset hashes that ARE used
  const usedAssets = await db
    .selectDistinct({ hash: releaseAssets.assetHash })
    .from(releaseAssets)
    .all();

  const usedHashes = usedAssets.map(r => r.hash);

  // If no assets are used, all are orphans (unless table is empty)
  // If table is empty, usedHashes is empty.
  
  let conditions = undefined;
  
  if (usedHashes.length > 0) {
      conditions = notInArray(assets.hash, usedHashes);
  }
  
  const orphanAssets = await db.select().from(assets).where(conditions).all();

  console.log(`Found ${orphanAssets.length} orphan assets`);

  let freedBytes = 0;
  for (const asset of orphanAssets) {
    const filePath = path.join(config.paths.dataDir, 'assets', asset.filePath);
    
    try {
        if (fs.existsSync(filePath)) {
            freedBytes += asset.sizeBytes;
            fs.unlinkSync(filePath);
        }
    } catch(e) {
        console.error(`Failed to delete file ${filePath}:`, e);
    }
    
    await db.delete(assets).where(sql`hash = ${asset.hash}`).run();
  }

  console.log(`✅ Cleaned ${orphanAssets.length} assets, freed ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
}

garbageCollect().catch(console.error);
