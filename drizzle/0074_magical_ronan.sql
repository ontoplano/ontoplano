CREATE TABLE `workout_measures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`session_id` integer NOT NULL,
	`activity` text NOT NULL,
	`amount` real,
	`unit` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_measures_user_idx` ON `workout_measures` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_measures_session_idx` ON `workout_measures` (`session_id`);--> statement-breakpoint
CREATE INDEX `workout_measures_activity_idx` ON `workout_measures` (`user_id`,`activity`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` integer NOT NULL,
	`done_on` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_user_idx` ON `workout_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_workout_idx` ON `workout_sessions` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_done_idx` ON `workout_sessions` (`done_on`);