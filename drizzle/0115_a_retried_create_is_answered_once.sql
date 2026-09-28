CREATE TABLE `request_replays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`tool` text NOT NULL,
	`fingerprint` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_replays_user_request_unique` ON `request_replays` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `request_replays_user_created_idx` ON `request_replays` (`user_id`,`created_at`);