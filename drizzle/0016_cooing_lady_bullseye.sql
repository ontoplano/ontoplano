-- Ownership moves into the row.
--
-- Five join tables had no `user_id`: which account a row belonged to was
-- whatever its parent said, so every statement touching them had to reach
-- through a join or trust an id that arrived from a form. The column is filled
-- from that same parent here, which is the last moment the old answer is
-- authoritative.
--
-- SQLite cannot add a NOT NULL column to an existing table, so each one is
-- rebuilt: new table, copy across with the account filled in, drop, rename.
-- `scripts/migrate.mjs` runs migrations with foreign keys off and an integrity
-- check afterwards, which is what makes the drop safe.
--
-- Rows whose parent is already gone are dropped rather than carried: a link to
-- a deleted entry belongs to nobody and is invisible to every query in the app.
CREATE TABLE `__new_diary_entry_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `diary_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_diary_entry_tags`(`id`, `user_id`, `entry_id`, `tag_id`) SELECT `id`, (SELECT `user_id` FROM `diary_entries` WHERE `diary_entries`.`id` = `diary_entry_tags`.`entry_id`), `entry_id`, `tag_id` FROM `diary_entry_tags` WHERE EXISTS (SELECT 1 FROM `diary_entries` WHERE `diary_entries`.`id` = `diary_entry_tags`.`entry_id`);--> statement-breakpoint
DROP TABLE `diary_entry_tags`;--> statement-breakpoint
ALTER TABLE `__new_diary_entry_tags` RENAME TO `diary_entry_tags`;--> statement-breakpoint
CREATE INDEX `diary_entry_tags_user_idx` ON `diary_entry_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `diary_entry_tags_entry_idx` ON `diary_entry_tags` (`entry_id`);--> statement-breakpoint
CREATE INDEX `diary_entry_tags_tag_idx` ON `diary_entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `__new_goal_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` integer NOT NULL,
	`slot_id` integer,
	`todo_id` integer,
	`activity_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`todo_id`) REFERENCES `planner_todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goal_link_has_exactly_one_target" CHECK((CASE WHEN "__new_goal_links"."slot_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "__new_goal_links"."todo_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "__new_goal_links"."activity_id" IS NULL THEN 0 ELSE 1 END) = 1)
);--> statement-breakpoint
INSERT INTO `__new_goal_links`(`id`, `user_id`, `goal_id`, `slot_id`, `todo_id`, `activity_id`) SELECT `id`, (SELECT `user_id` FROM `goals` WHERE `goals`.`id` = `goal_links`.`goal_id`), `goal_id`, `slot_id`, `todo_id`, `activity_id` FROM `goal_links` WHERE EXISTS (SELECT 1 FROM `goals` WHERE `goals`.`id` = `goal_links`.`goal_id`);--> statement-breakpoint
DROP TABLE `goal_links`;--> statement-breakpoint
ALTER TABLE `__new_goal_links` RENAME TO `goal_links`;--> statement-breakpoint
CREATE INDEX `goal_links_user_idx` ON `goal_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `goal_links_goal_idx` ON `goal_links` (`goal_id`);--> statement-breakpoint
CREATE TABLE `__new_habit_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`habit_id` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_habit_occurrences`(`id`, `user_id`, `habit_id`, `date`, `notes`, `created_at`) SELECT `id`, (SELECT `user_id` FROM `habits` WHERE `habits`.`id` = `habit_occurrences`.`habit_id`), `habit_id`, `date`, `notes`, `created_at` FROM `habit_occurrences` WHERE EXISTS (SELECT 1 FROM `habits` WHERE `habits`.`id` = `habit_occurrences`.`habit_id`);--> statement-breakpoint
DROP TABLE `habit_occurrences`;--> statement-breakpoint
ALTER TABLE `__new_habit_occurrences` RENAME TO `habit_occurrences`;--> statement-breakpoint
CREATE INDEX `habit_occurrences_user_idx` ON `habit_occurrences` (`user_id`);--> statement-breakpoint
CREATE INDEX `habit_occurrences_habit_idx` ON `habit_occurrences` (`habit_id`);--> statement-breakpoint
CREATE INDEX `habit_occurrences_date_idx` ON `habit_occurrences` (`date`);--> statement-breakpoint
CREATE TABLE `__new_idea_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`idea_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_idea_tags`(`id`, `user_id`, `idea_id`, `tag_id`) SELECT `id`, (SELECT `user_id` FROM `ideas` WHERE `ideas`.`id` = `idea_tags`.`idea_id`), `idea_id`, `tag_id` FROM `idea_tags` WHERE EXISTS (SELECT 1 FROM `ideas` WHERE `ideas`.`id` = `idea_tags`.`idea_id`);--> statement-breakpoint
DROP TABLE `idea_tags`;--> statement-breakpoint
ALTER TABLE `__new_idea_tags` RENAME TO `idea_tags`;--> statement-breakpoint
CREATE INDEX `idea_tags_user_idx` ON `idea_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `idea_tags_idea_idx` ON `idea_tags` (`idea_id`);--> statement-breakpoint
CREATE INDEX `idea_tags_tag_idx` ON `idea_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `__new_scheme_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`scheme_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scheme_id`) REFERENCES `planning_schemes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_scheme_slots`(`id`, `user_id`, `scheme_id`, `weekday`, `start_time`, `duration_minutes`, `mode`, `category_id`, `activity_id`, `label`, `active`) SELECT `id`, (SELECT `user_id` FROM `planning_schemes` WHERE `planning_schemes`.`id` = `scheme_slots`.`scheme_id`), `scheme_id`, `weekday`, `start_time`, `duration_minutes`, `mode`, `category_id`, `activity_id`, `label`, `active` FROM `scheme_slots` WHERE EXISTS (SELECT 1 FROM `planning_schemes` WHERE `planning_schemes`.`id` = `scheme_slots`.`scheme_id`);--> statement-breakpoint
DROP TABLE `scheme_slots`;--> statement-breakpoint
ALTER TABLE `__new_scheme_slots` RENAME TO `scheme_slots`;--> statement-breakpoint
CREATE INDEX `scheme_slots_user_idx` ON `scheme_slots` (`user_id`);--> statement-breakpoint
CREATE INDEX `scheme_slots_scheme_idx` ON `scheme_slots` (`scheme_id`);
