import { eq } from 'drizzle-orm';
import { ExpoManifest, ExpoAsset, Release } from './types';
import { config } from './config';
import { db } from './database';
import { releaseAssets, assets as assetsTable } from './db/schema';

export function buildManifest(release: Release): ExpoManifest {
  // Fetch assets for this release
  const releaseAssetsData = db.select({
    assetKey: releaseAssets.assetKey,
    isLaunchAsset: releaseAssets.isLaunchAsset,
    hash: assetsTable.hash,
    contentType: assetsTable.contentType,
    fileExtension: assetsTable.fileExtension
  })
  .from(releaseAssets)
  .innerJoin(assetsTable, eq(releaseAssets.assetHash, assetsTable.hash))
  .where(eq(releaseAssets.releaseId, release.id))
  .all();

  const launchAssetRecord = releaseAssetsData.find(a => a.isLaunchAsset);
  if (!launchAssetRecord) {
    throw new Error(`Release ${release.id} has no launch asset (bundle).`);
  }

  const assets: ExpoAsset[] = releaseAssetsData
    .filter(a => !a.isLaunchAsset)
    .map(a => ({
      key: a.assetKey,
      hash: a.hash,
      fileExtension: a.fileExtension,
      contentType: a.contentType,
      url: `${config.server.baseUrl}/assets/${a.hash}`
    }));

  const launchAsset: ExpoAsset = {
    key: launchAssetRecord.assetKey,
    hash: launchAssetRecord.hash,
    fileExtension: launchAssetRecord.fileExtension,
    contentType: launchAssetRecord.contentType,
    url: `${config.server.baseUrl}/assets/${launchAssetRecord.hash}`
  };

  const manifest: ExpoManifest = {
    id: release.id,
    createdAt: release.createdAt,
    runtimeVersion: release.runtimeVersion,
    launchAsset,
    assets,
    metadata: {}, 
    extra: {
      expoClient: {
        // Can inject exposing custom config here if needed
        // For standard updates, minimal is fine.
      }
    }
  };

  // If we stored original manifest JSON, usually we might want to merge or prefer that?
  // But constructing it fresh ensures URLs are correct for *this* server instance vs build time.
  // Although, if there are custom 'extra' fields from app.json they might be missing here unless they are stored in DB.
  // For a production 'self-hosted' replacing EAS, usually the critical part is JS bundle + Assets.
  // The 'manifest_json' in DB is often the one from the export.
  
  if (release.manifestJson) {
    try {
      const original = JSON.parse(release.manifestJson);
      // Merge metadata or extra if critical
      manifest.metadata = { ...original.metadata, ...manifest.metadata };
      manifest.extra = { ...original.extra, ...manifest.extra };
    } catch (e) {
      console.warn(`Failed to parse stored manifest JSON for release ${release.id}`);
    }
  }

  return manifest;
}
