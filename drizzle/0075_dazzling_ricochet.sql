CREATE TABLE `workout_plan_measures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` integer NOT NULL,
	`activity` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_plan_measures_user_idx` ON `workout_plan_measures` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_plan_measures_workout_idx` ON `workout_plan_measures` (`workout_id`);