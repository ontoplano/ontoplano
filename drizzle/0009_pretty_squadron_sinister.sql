CREATE TABLE `goal_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goal_areas_user_idx` ON `goal_areas` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `goal_areas_user_name_unique` ON `goal_areas` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `goal_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`slot_id` integer,
	`todo_id` integer,
	`activity_id` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`todo_id`) REFERENCES `planner_todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goal_link_has_exactly_one_target" CHECK((CASE WHEN "goal_links"."slot_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "goal_links"."todo_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "goal_links"."activity_id" IS NULL THEN 0 ELSE 1 END) = 1)
);
--> statement-breakpoint
CREATE INDEX `goal_links_goal_idx` ON `goal_links` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`area_id` integer,
	`parent_id` integer,
	`title` text NOT NULL,
	`notes` text DEFAULT '',
	`horizon` text NOT NULL,
	`period_start` text NOT NULL,
	`target_value` real,
	`current_value` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT '',
	`status` text DEFAULT 'open' NOT NULL,
	`outcome` text DEFAULT '',
	`closed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_id`) REFERENCES `goal_areas`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "goals_target_positive" CHECK("goals"."target_value" IS NULL OR "goals"."target_value" > 0)
);
--> statement-breakpoint
CREATE INDEX `goals_user_idx` ON `goals` (`user_id`);--> statement-breakpoint
CREATE INDEX `goals_period_idx` ON `goals` (`user_id`,`horizon`,`period_start`);--> statement-breakpoint
CREATE INDEX `goals_parent_idx` ON `goals` (`parent_id`);--> statement-breakpoint
CREATE INDEX `goals_area_idx` ON `goals` (`area_id`);