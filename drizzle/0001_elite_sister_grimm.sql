PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deployment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`release_id` text,
	`event_type` text NOT NULL,
	`client_ip` text,
	`user_agent` text,
	`expo_platform` text,
	`expo_runtime_version` text,
	`error_message` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_deployment_events`("id", "release_id", "event_type", "client_ip", "user_agent", "expo_platform", "expo_runtime_version", "error_message", "created_at") SELECT "id", "release_id", "event_type", "client_ip", "user_agent", "expo_platform", "expo_runtime_version", "error_message", "created_at" FROM `deployment_events`;--> statement-breakpoint
DROP TABLE `deployment_events`;--> statement-breakpoint
ALTER TABLE `__new_deployment_events` RENAME TO `deployment_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_release` ON `deployment_events` (`release_id`);--> statement-breakpoint
CREATE TABLE `__new_release_assets` (
	`release_id` text NOT NULL,
	`asset_hash` text NOT NULL,
	`asset_key` text NOT NULL,
	`is_launch_asset` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`release_id`, `asset_hash`),
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_hash`) REFERENCES `assets`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_release_assets`("release_id", "asset_hash", "asset_key", "is_launch_asset") SELECT "release_id", "asset_hash", "asset_key", "is_launch_asset" FROM `release_assets`;--> statement-breakpoint
DROP TABLE `release_assets`;--> statement-breakpoint
ALTER TABLE `__new_release_assets` RENAME TO `release_assets`;