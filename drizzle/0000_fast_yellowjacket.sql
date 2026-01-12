CREATE TABLE `assets` (
	`hash` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`content_type` text NOT NULL,
	`file_extension` text DEFAULT '.bin' NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`name` text PRIMARY KEY NOT NULL,
	`description` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`release_id` text,
	`event_type` text NOT NULL,
	`client_ip` text,
	`user_agent` text,
	`expo_platform` text,
	`expo_runtime_version` text,
	`error_message` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_release` ON `deployment_events` (`release_id`);--> statement-breakpoint
CREATE TABLE `release_assets` (
	`release_id` text NOT NULL,
	`asset_hash` text NOT NULL,
	`asset_key` text NOT NULL,
	`is_launch_asset` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_hash`) REFERENCES `assets`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pk_release_assets` ON `release_assets` (`release_id`,`asset_hash`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`runtime_version` text NOT NULL,
	`platform` text NOT NULL,
	`channel` text NOT NULL,
	`git_commit` text,
	`git_branch` text,
	`message` text,
	`is_active` integer DEFAULT false NOT NULL,
	`is_rollback` integer DEFAULT false NOT NULL,
	`rollback_from_id` text,
	`bundle_path` text NOT NULL,
	`manifest_json` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`activated_at` text,
	`deactivated_at` text,
	FOREIGN KEY (`runtime_version`) REFERENCES `runtime_versions`(`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel`) REFERENCES `channels`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_releases_channel` ON `releases` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_releases_runtime` ON `releases` (`runtime_version`);--> statement-breakpoint
CREATE INDEX `idx_releases_platform` ON `releases` (`platform`);--> statement-breakpoint
CREATE TABLE `runtime_versions` (
	`version` text PRIMARY KEY NOT NULL,
	`min_app_version` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deprecated_at` text
);
