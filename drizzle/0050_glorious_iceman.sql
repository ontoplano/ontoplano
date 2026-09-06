CREATE TABLE `trainings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`plan` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '',
	`minutes` integer,
	`last_done_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trainings_minutes_positive" CHECK("trainings"."minutes" IS NULL OR "trainings"."minutes" > 0)
);
--> statement-breakpoint
CREATE INDEX `trainings_user_idx` ON `trainings` (`user_id`);--> statement-breakpoint
ALTER TABLE `exceptional_tasks` ADD `training_id` integer REFERENCES trainings(id);--> statement-breakpoint
ALTER TABLE `recurring_tasks` ADD `training_id` integer REFERENCES trainings(id);