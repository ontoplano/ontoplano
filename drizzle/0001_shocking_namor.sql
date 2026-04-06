CREATE TABLE `belief_contradictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `belief_contradictions_belief_idx` ON `belief_contradictions` (`belief_id`);--> statement-breakpoint
CREATE TABLE `belief_habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`habit_id` integer NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `belief_habits_belief_idx` ON `belief_habits` (`belief_id`);--> statement-breakpoint
CREATE INDEX `belief_habits_habit_idx` ON `belief_habits` (`habit_id`);--> statement-breakpoint
CREATE TABLE `belief_intensities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "belief_intensities_value_range" CHECK("belief_intensities"."value" >= 1 AND "belief_intensities"."value" <= 10)
);
--> statement-breakpoint
CREATE INDEX `belief_intensities_belief_idx` ON `belief_intensities` (`belief_id`);--> statement-breakpoint
CREATE INDEX `belief_intensities_date_idx` ON `belief_intensities` (`date`);--> statement-breakpoint
CREATE TABLE `belief_reasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `belief_reasons_belief_idx` ON `belief_reasons` (`belief_id`);--> statement-breakpoint
CREATE TABLE `beliefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `beliefs_created_idx` ON `beliefs` (`created_at`);--> statement-breakpoint
CREATE TABLE `diary_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `diary_entries_created_idx` ON `diary_entries` (`created_at`);--> statement-breakpoint
CREATE TABLE `diary_entry_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `diary_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diary_entry_tags_entry_idx` ON `diary_entry_tags` (`entry_id`);--> statement-breakpoint
CREATE INDEX `diary_entry_tags_tag_idx` ON `diary_entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `habit_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `habit_occurrences_habit_idx` ON `habit_occurrences` (`habit_id`);--> statement-breakpoint
CREATE INDEX `habit_occurrences_date_idx` ON `habit_occurrences` (`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`type` text DEFAULT 'bad' NOT NULL,
	`scheduled_days` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
ALTER TABLE `task_instances` ADD `duration_override` integer;