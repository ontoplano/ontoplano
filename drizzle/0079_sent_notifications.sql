CREATE TABLE `sent_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text,
	`kind` text DEFAULT '' NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sent_notifications_user_idx` ON `sent_notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `sent_notifications_unread_idx` ON `sent_notifications` (`user_id`,`read_at`);