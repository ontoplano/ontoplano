-- Trainings become workouts: the table, the column on a block, the mode value,
-- and the scope on an API token.
--
-- Hand-corrected. drizzle-kit sees a renamed table as a new one beside a
-- dropped one, so as generated this began `CREATE TABLE workouts` and ended
-- `DROP TABLE trainings` with nothing carried across — every workout gone. It
-- also wrote the rebuilt blocks' INSERT ... SELECT reading `workout_id` from
-- the table that still calls it `training_id`, which fails outright on any
-- database that has one. The new tables below are drizzle's (their constraint
-- names are the ones the next diff will expect); the data movement is not.

CREATE TABLE `workouts` (
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
	CONSTRAINT "workouts_minutes_positive" CHECK("workouts"."minutes" IS NULL OR "workouts"."minutes" > 0)
);
--> statement-breakpoint
CREATE INDEX `workouts_user_idx` ON `workouts` (`user_id`);--> statement-breakpoint
INSERT INTO `workouts` ("id", "user_id", "title", "kind", "plan", "notes", "minutes", "last_done_at", "archived_at", "created_at", "updated_at") SELECT "id", "user_id", "title", "kind", "plan", "notes", "minutes", "last_done_at", "archived_at", "created_at", "updated_at" FROM `trainings`;--> statement-breakpoint
DROP TABLE `trainings`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exceptional_tasks` (
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
	`energy` integer,
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
	CONSTRAINT "exceptional_urgency_range" CHECK("__new_exceptional_tasks"."urgency" IS NULL OR "__new_exceptional_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_interest_range" CHECK("__new_exceptional_tasks"."interest" IS NULL OR "__new_exceptional_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_energy_range" CHECK("__new_exceptional_tasks"."energy" IS NULL OR "__new_exceptional_tasks"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_mode_category" CHECK("__new_exceptional_tasks"."mode" != 'category' OR "__new_exceptional_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("__new_exceptional_tasks"."mode" != 'activity' OR "__new_exceptional_tasks"."activity_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_workout" CHECK("__new_exceptional_tasks"."mode" != 'workout' OR "__new_exceptional_tasks"."workout_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_exceptional_tasks`("id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "notebook_id", "urgency", "interest", "energy", "meta", "recipe_id", "workout_id", "created_at") SELECT "id", "user_id", "date", "start_time", "duration_minutes", CASE WHEN "mode" = 'training' THEN 'workout' ELSE "mode" END, "category_id", "activity_id", "label", "active", "remind_lead_minutes", "notebook_id", "urgency", "interest", "energy", "meta", "recipe_id", "training_id", "created_at" FROM `exceptional_tasks`;--> statement-breakpoint
DROP TABLE `exceptional_tasks`;--> statement-breakpoint
ALTER TABLE `__new_exceptional_tasks` RENAME TO `exceptional_tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `exceptional_tasks_user_date_idx` ON `exceptional_tasks` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `exceptional_tasks_notebook_idx` ON `exceptional_tasks` (`notebook_id`);--> statement-breakpoint
CREATE TABLE `__new_recurring_tasks` (
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
	`energy` integer,
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
	CONSTRAINT "slots_urgency_range" CHECK("__new_recurring_tasks"."urgency" IS NULL OR "__new_recurring_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "slots_interest_range" CHECK("__new_recurring_tasks"."interest" IS NULL OR "__new_recurring_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "slots_energy_range" CHECK("__new_recurring_tasks"."energy" IS NULL OR "__new_recurring_tasks"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "slots_weekday_range" CHECK("__new_recurring_tasks"."weekday" >= 0 AND "__new_recurring_tasks"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("__new_recurring_tasks"."mode" != 'category' OR "__new_recurring_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("__new_recurring_tasks"."mode" != 'activity' OR "__new_recurring_tasks"."activity_id" IS NOT NULL),
	CONSTRAINT "slots_mode_workout" CHECK("__new_recurring_tasks"."mode" != 'workout' OR "__new_recurring_tasks"."workout_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_recurring_tasks`("id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "urgency", "interest", "energy", "meta", "recipe_id", "workout_id", "created_at", "updated_at") SELECT "id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", CASE WHEN "mode" = 'training' THEN 'workout' ELSE "mode" END, "category_id", "activity_id", "label", "active", "remind_lead_minutes", "urgency", "interest", "energy", "meta", "recipe_id", "training_id", "created_at", "updated_at" FROM `recurring_tasks`;--> statement-breakpoint
DROP TABLE `recurring_tasks`;--> statement-breakpoint
ALTER TABLE `__new_recurring_tasks` RENAME TO `recurring_tasks`;--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `recurring_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `slots_weekday_idx` ON `recurring_tasks` (`weekday`);--> statement-breakpoint
CREATE INDEX `slots_weekday_time_idx` ON `recurring_tasks` (`weekday`,`start_time`);
--> statement-breakpoint
-- A scheme copies a block's mode when it is saved, so one saved from a workout
-- block carries the old word. No CHECK constrains this column, so a plain
-- update is the whole of it.
UPDATE `scheme_slots` SET `mode` = 'workout' WHERE `mode` = 'training';--> statement-breakpoint
-- An API token already handed out asks for `trainings:read`; the app now only
-- knows `workouts:read`, and a token that silently lost a permission is worse
-- than one that never had it.
UPDATE `api_tokens` SET `scopes` = replace(`scopes`, 'trainings:', 'workouts:') WHERE `scopes` LIKE '%trainings:%';
