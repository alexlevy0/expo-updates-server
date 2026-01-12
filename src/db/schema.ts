import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

export const channels = sqliteTable('channels', {
  name: text('name').primaryKey(),
  description: text('description'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const runtimeVersions = sqliteTable('runtime_versions', {
  version: text('version').primaryKey(),
  minAppVersion: text('min_app_version'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deprecatedAt: text('deprecated_at'),
});

export const releases = sqliteTable('releases', {
  id: text('id').primaryKey(),
  runtimeVersion: text('runtime_version').notNull().references(() => runtimeVersions.version),
  platform: text('platform').notNull(),
  channel: text('channel').notNull().references(() => channels.name),
  gitCommit: text('git_commit'),
  gitBranch: text('git_branch'),
  message: text('message'),
  releaseNotes: text('release_notes'),
  isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
  isRollback: integer('is_rollback', { mode: 'boolean' }).default(false).notNull(),
  rollbackFromId: text('rollback_from_id'), // Self-reference handled by relations or raw query if needed
  bundlePath: text('bundle_path').notNull(),
  manifestJson: text('manifest_json').notNull(), // Stored as JSON string
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  activatedAt: text('activated_at'),
  deactivatedAt: text('deactivated_at'),
}, (table) => {
    return {
        idxReleasesChannel: index('idx_releases_channel').on(table.channel),
        idxReleasesRuntime: index('idx_releases_runtime').on(table.runtimeVersion),
        idxReleasesPlatform: index('idx_releases_platform').on(table.platform),
    }
});

export const assets = sqliteTable('assets', {
  hash: text('hash').primaryKey(),
  filePath: text('file_path').notNull(),
  contentType: text('content_type').notNull(),
  fileExtension: text('file_extension').default('.bin').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const releaseAssets = sqliteTable('release_assets', {
  releaseId: text('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  assetHash: text('asset_hash').notNull().references(() => assets.hash),
  assetKey: text('asset_key').notNull(),
  isLaunchAsset: integer('is_launch_asset', { mode: 'boolean' }).default(false).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.releaseId, table.assetHash] }),
  }
});

// Composite PK separate definition
// Drizzle ORM sqlite-core doesn't have a simple method for composite PK inside the column definitions easily without using `primaryKey` helper.
// Refactoring to use `primaryKey` import if needed, but for now strict schema parity:
// original schema: PRIMARY KEY (release_id, asset_hash)

export const deploymentEvents = sqliteTable('deployment_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  releaseId: text('release_id').references(() => releases.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
  expoPlatform: text('expo_platform'),
  expoRuntimeVersion: text('expo_runtime_version'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => {
    return {
        idxEventsRelease: index('idx_events_release').on(table.releaseId),
    }
});


// Relations
export const releasesRelations = relations(releases, ({ one, many }) => ({
  runtimeVersionRel: one(runtimeVersions, {
    fields: [releases.runtimeVersion],
    references: [runtimeVersions.version],
  }),
  channelRel: one(channels, {
    fields: [releases.channel],
    references: [channels.name],
  }),
  assets: many(releaseAssets),
}));

export const releaseAssetsRelations = relations(releaseAssets, ({ one }) => ({
  release: one(releases, {
    fields: [releaseAssets.releaseId],
    references: [releases.id],
  }),
  asset: one(assets, {
    fields: [releaseAssets.assetHash],
    references: [assets.hash],
  }),
}));
