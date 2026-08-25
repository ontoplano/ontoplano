CREATE TABLE `notebooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '',
	`closed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notebooks_user_idx` ON `notebooks` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notebooks_user_title_unique` ON `notebooks` (`user_id`,`title`);--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `notebook_id` integer REFERENCES notebooks(id);--> statement-breakpoint
CREATE INDEX `diary_entries_notebook_idx` ON `diary_entries` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `exceptional_slots` ADD `notebook_id` integer REFERENCES notebooks(id);--> statement-breakpoint
CREATE INDEX `exceptional_slots_notebook_idx` ON `exceptional_slots` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `goals` ADD `notebook_id` integer REFERENCES notebooks(id);--> statement-breakpoint
CREATE INDEX `goals_notebook_idx` ON `goals` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `planner_todos` ADD `notebook_id` integer REFERENCES notebooks(id);--> statement-breakpoint
CREATE INDEX `planner_todos_notebook_idx` ON `planner_todos` (`notebook_id`);