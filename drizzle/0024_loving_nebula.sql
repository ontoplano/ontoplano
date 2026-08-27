CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`subject_kind` text DEFAULT 'free' NOT NULL,
	`subject_id` integer,
	`remind_at` text NOT NULL,
	`message` text NOT NULL,
	`delivered_at` text,
	`dismissed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reminders_user_idx` ON `reminders` (`user_id`);--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`user_id`,`delivered_at`,`remind_at`);--> statement-breakpoint
CREATE INDEX `reminders_subject_idx` ON `reminders` (`subject_kind`,`subject_id`);