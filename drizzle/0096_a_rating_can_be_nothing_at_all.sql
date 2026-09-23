-- Nought is an answer, so the scales run from nought to five.
--
-- They ran one to five with a check to match, which made the bottom of each
-- scale "the least there is" rather than "none at all" — and left 2.5, the
-- number an unrated task counts as, sitting off-centre. Nought to five puts it
-- dead centre with three answers either side of it.
--
-- SQLite cannot alter a CHECK, so every table carrying a rating is rebuilt
-- around the wider one. The definitions below are drizzle's own, read back out
-- of a database it built from the schema, so the next diff sees exactly what it
-- expects — but the data movement is written here rather than by it, because
-- what it generates for a rebuild has emptied a table in this repository
-- before.
--
-- Nothing is converted: a rating of 3 means what it meant. The scale gained a
-- value at the bottom, and no existing one moved.
--
-- Foreign keys are off while migrations run and checked afterwards, so the
-- order is: build beside it, copy across, drop, rename, put the indexes back.
--
-- Each CHECK names the table it sits on, so while the new one is standing
-- beside the old it has to name *that* — the rename puts the real name back
-- into them, which is the one part of this SQLite does for you.


-- todo_tasks
CREATE TABLE `todo_tasks__wider` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '',
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`category_id` integer,
	`notebook_id` integer,
	`notebook_seq` integer,
	`scheduled_date` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`archived_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`urgency` integer,
	`interest` integer,
	`ease` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "todos_urgency_range" CHECK("todo_tasks__wider"."urgency" IS NULL OR "todo_tasks__wider"."urgency" BETWEEN 0 AND 5),
	CONSTRAINT "todos_interest_range" CHECK("todo_tasks__wider"."interest" IS NULL OR "todo_tasks__wider"."interest" BETWEEN 0 AND 5),
	CONSTRAINT "todos_ease_range" CHECK("todo_tasks__wider"."ease" IS NULL OR "todo_tasks__wider"."ease" BETWEEN 0 AND 5)
);--> statement-breakpoint
INSERT INTO `todo_tasks__wider` (`id`, `user_id`, `title`, `notes`, `completed`, `completed_at`, `category_id`, `notebook_id`, `notebook_seq`, `scheduled_date`, `status`, `archived_at`, `sort_order`, `urgency`, `interest`, `ease`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `title`, `notes`, `completed`, `completed_at`, `category_id`, `notebook_id`, `notebook_seq`, `scheduled_date`, `status`, `archived_at`, `sort_order`, `urgency`, `interest`, `ease`, `created_at`, `updated_at` FROM `todo_tasks`;--> statement-breakpoint
DROP TABLE `todo_tasks`;--> statement-breakpoint
ALTER TABLE `todo_tasks__wider` RENAME TO `todo_tasks`;--> statement-breakpoint
CREATE INDEX `todo_tasks_user_idx` ON `todo_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_tasks_scheduled_idx` ON `todo_tasks` (`user_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `todo_tasks_notebook_idx` ON `todo_tasks` (`notebook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `todo_tasks_notebook_seq_unique` ON `todo_tasks` (`notebook_id`,`notebook_seq`);--> statement-breakpoint
-- exceptional_tasks
CREATE TABLE `exceptional_tasks__wider` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`remind_lead_minutes` integer,
	`notebook_id` integer,
	`urgency` integer,
	`interest` integer,
	`ease` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`recipe_id` integer,
	`workout_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "exceptional_urgency_range" CHECK("exceptional_tasks__wider"."urgency" IS NULL OR "exceptional_tasks__wider"."urgency" BETWEEN 0 AND 5),
	CONSTRAINT "exceptional_interest_range" CHECK("exceptional_tasks__wider"."interest" IS NULL OR "exceptional_tasks__wider"."interest" BETWEEN 0 AND 5),
	CONSTRAINT "exceptional_ease_range" CHECK("exceptional_tasks__wider"."ease" IS NULL OR "exceptional_tasks__wider"."ease" BETWEEN 0 AND 5),
	CONSTRAINT "exceptional_mode_category" CHECK("exceptional_tasks__wider"."mode" != 'category' OR "exceptional_tasks__wider"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("exceptional_tasks__wider"."mode" != 'activity' OR "exceptional_tasks__wider"."activity_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_workout" CHECK("exceptional_tasks__wider"."mode" != 'workout' OR "exceptional_tasks__wider"."workout_id" IS NOT NULL)
);--> statement-breakpoint
INSERT INTO `exceptional_tasks__wider` (`id`, `user_id`, `date`, `start_time`, `duration_minutes`, `mode`, `category_id`, `activity_id`, `label`, `active`, `remind_lead_minutes`, `notebook_id`, `urgency`, `interest`, `ease`, `meta`, `recipe_id`, `workout_id`, `created_at`) SELECT `id`, `user_id`, `date`, `start_time`, `duration_minutes`, `mode`, `category_id`, `activity_id`, `label`, `active`, `remind_lead_minutes`, `notebook_id`, `urgency`, `interest`, `ease`, `meta`, `recipe_id`, `workout_id`, `created_at` FROM `exceptional_tasks`;--> statement-breakpoint
DROP TABLE `exceptional_tasks`;--> statement-breakpoint
ALTER TABLE `exceptional_tasks__wider` RENAME TO `exceptional_tasks`;--> statement-breakpoint
CREATE INDEX `exceptional_tasks_user_date_idx` ON `exceptional_tasks` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `exceptional_tasks_notebook_idx` ON `exceptional_tasks` (`notebook_id`);--> statement-breakpoint
-- recurring_tasks
CREATE TABLE `recurring_tasks__wider` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`recurrence` text DEFAULT 'weekly' NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`remind_lead_minutes` integer,
	`urgency` integer,
	`interest` integer,
	`ease` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`recipe_id` integer,
	`workout_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "slots_urgency_range" CHECK("recurring_tasks__wider"."urgency" IS NULL OR "recurring_tasks__wider"."urgency" BETWEEN 0 AND 5),
	CONSTRAINT "slots_interest_range" CHECK("recurring_tasks__wider"."interest" IS NULL OR "recurring_tasks__wider"."interest" BETWEEN 0 AND 5),
	CONSTRAINT "slots_ease_range" CHECK("recurring_tasks__wider"."ease" IS NULL OR "recurring_tasks__wider"."ease" BETWEEN 0 AND 5),
	CONSTRAINT "slots_weekday_range" CHECK("recurring_tasks__wider"."weekday" >= 0 AND "recurring_tasks__wider"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("recurring_tasks__wider"."mode" != 'category' OR "recurring_tasks__wider"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("recurring_tasks__wider"."mode" != 'activity' OR "recurring_tasks__wider"."activity_id" IS NOT NULL),
	CONSTRAINT "slots_mode_workout" CHECK("recurring_tasks__wider"."mode" != 'workout' OR "recurring_tasks__wider"."workout_id" IS NOT NULL)
);--> statement-breakpoint
INSERT INTO `recurring_tasks__wider` (`id`, `user_id`, `weekday`, `recurrence`, `start_time`, `duration_minutes`, `mode`, `category_id`, `activity_id`, `label`, `active`, `remind_lead_minutes`, `urgency`, `interest`, `ease`, `meta`, `recipe_id`, `workout_id`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `weekday`, `recurrence`, `start_time`, `duration_minutes`, `mode`, `category_id`, `activity_id`, `label`, `active`, `remind_lead_minutes`, `urgency`, `interest`, `ease`, `meta`, `recipe_id`, `workout_id`, `created_at`, `updated_at` FROM `recurring_tasks`;--> statement-breakpoint
DROP TABLE `recurring_tasks`;--> statement-breakpoint
ALTER TABLE `recurring_tasks__wider` RENAME TO `recurring_tasks`;--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `recurring_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `slots_weekday_idx` ON `recurring_tasks` (`weekday`);--> statement-breakpoint
CREATE INDEX `slots_weekday_time_idx` ON `recurring_tasks` (`weekday`,`start_time`);--> statement-breakpoint
-- task_records
CREATE TABLE `task_records__wider` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slot_id` integer,
	`exceptional_slot_id` integer,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`completed_at` text,
	`notes` text DEFAULT '',
	`resolved_activity_id` integer,
	`duration_override` integer,
	`label_override` text,
	`urgency_override` integer,
	`interest_override` integer,
	`ease_override` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `recurring_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exceptional_slot_id`) REFERENCES `exceptional_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "instance_has_exactly_one_source" CHECK(("task_records__wider"."slot_id" IS NULL) != ("task_records__wider"."exceptional_slot_id" IS NULL))
);--> statement-breakpoint
INSERT INTO `task_records__wider` (`id`, `user_id`, `slot_id`, `exceptional_slot_id`, `scheduled_at`, `status`, `completed_at`, `notes`, `resolved_activity_id`, `duration_override`, `label_override`, `urgency_override`, `interest_override`, `ease_override`, `created_at`) SELECT `id`, `user_id`, `slot_id`, `exceptional_slot_id`, `scheduled_at`, `status`, `completed_at`, `notes`, `resolved_activity_id`, `duration_override`, `label_override`, `urgency_override`, `interest_override`, `ease_override`, `created_at` FROM `task_records`;--> statement-breakpoint
DROP TABLE `task_records`;--> statement-breakpoint
ALTER TABLE `task_records__wider` RENAME TO `task_records`;--> statement-breakpoint
CREATE INDEX `instances_user_idx` ON `task_records` (`user_id`);--> statement-breakpoint
CREATE INDEX `instances_slot_idx` ON `task_records` (`slot_id`);--> statement-breakpoint
CREATE INDEX `instances_exceptional_idx` ON `task_records` (`exceptional_slot_id`);--> statement-breakpoint
CREATE INDEX `instances_scheduled_idx` ON `task_records` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `instances_status_idx` ON `task_records` (`status`);--> statement-breakpoint
CREATE INDEX `instances_slot_scheduled_idx` ON `task_records` (`slot_id`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `instances_exceptional_unique` ON `task_records` (`exceptional_slot_id`);
