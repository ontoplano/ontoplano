CREATE TABLE `plugin_manifests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`homepage` text DEFAULT '',
	`meta_keys` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_manifests_user_source_unique` ON `plugin_manifests` (`user_id`,`source`);--> statement-breakpoint
CREATE INDEX `plugin_manifests_user_idx` ON `plugin_manifests` (`user_id`);