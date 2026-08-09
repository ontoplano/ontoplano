CREATE TABLE `api_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `data_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`stream_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`at` text NOT NULL,
	`local_date` text NOT NULL,
	`value_num` real,
	`value_text` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stream_id`) REFERENCES `data_streams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_points_stream_external_unique` ON `data_points` (`stream_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `data_points_stream_at_idx` ON `data_points` (`stream_id`,`at`);--> statement-breakpoint
CREATE INDEX `data_points_user_idx` ON `data_points` (`user_id`);--> statement-breakpoint
CREATE INDEX `data_points_stream_local_date_idx` ON `data_points` (`stream_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `data_streams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`display` text DEFAULT 'list' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`show_on_dashboard` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_streams_user_slug_unique` ON `data_streams` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `data_streams_user_idx` ON `data_streams` (`user_id`);