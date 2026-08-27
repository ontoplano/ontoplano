CREATE TABLE `weekly_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`week_start` text NOT NULL,
	`position` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `weekly_reviews_user_week_idx` ON `weekly_reviews` (`user_id`,`week_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reviews_slot_unique` ON `weekly_reviews` (`user_id`,`week_start`,`position`);