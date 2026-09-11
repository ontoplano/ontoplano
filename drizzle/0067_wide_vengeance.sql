CREATE TABLE `albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `albums_user_idx` ON `albums` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_user_name_unique` ON `albums` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `album_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`album_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`added_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `album_media_user_idx` ON `album_media` (`user_id`);--> statement-breakpoint
CREATE INDEX `album_media_media_idx` ON `album_media` (`media_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `album_media_album_media_unique` ON `album_media` (`album_id`,`media_id`);--> statement-breakpoint
CREATE TABLE `media_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`media_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_tags_user_idx` ON `media_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `media_tags_media_idx` ON `media_tags` (`media_id`);--> statement-breakpoint
CREATE INDEX `media_tags_tag_idx` ON `media_tags` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_tags_media_tag_unique` ON `media_tags` (`media_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`occurred_on` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`fingerprint` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_transactions_user_idx` ON `finance_transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_user_date_idx` ON `finance_transactions` (`user_id`,`occurred_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_transactions_fingerprint_unique` ON `finance_transactions` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `finance_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`pattern` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_rules_user_idx` ON `finance_rules` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_rules_name_unique` ON `finance_rules` (`user_id`,`kind`,`name`);--> statement-breakpoint
ALTER TABLE `bills` ADD `flow` text DEFAULT 'out' NOT NULL;
