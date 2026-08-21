PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exceptional_slots` (
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
	`urgency` integer,
	`interest` integer,
	`energy` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exceptional_urgency_range" CHECK("__new_exceptional_slots"."urgency" IS NULL OR "__new_exceptional_slots"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_interest_range" CHECK("__new_exceptional_slots"."interest" IS NULL OR "__new_exceptional_slots"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_energy_range" CHECK("__new_exceptional_slots"."energy" IS NULL OR "__new_exceptional_slots"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_mode_category" CHECK("__new_exceptional_slots"."mode" != 'category' OR "__new_exceptional_slots"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("__new_exceptional_slots"."mode" != 'activity' OR "__new_exceptional_slots"."activity_id" IS NOT NULL)
);
--> statement-breakpoint
-- New rating columns start unset; nothing in the old table maps to them.
INSERT INTO `__new_exceptional_slots`("id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "urgency", "interest", "energy", "meta", "created_at")
SELECT "id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", NULL, NULL, NULL, "meta", "created_at" FROM `exceptional_slots`;--> statement-breakpoint
DROP TABLE `exceptional_slots`;--> statement-breakpoint
ALTER TABLE `__new_exceptional_slots` RENAME TO `exceptional_slots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `exceptional_slots_user_date_idx` ON `exceptional_slots` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_planner_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '',
	`completed` integer DEFAULT false NOT NULL,
	`category_id` integer,
	`scheduled_date` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`urgency` integer,
	`interest` integer,
	`energy` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "todos_urgency_range" CHECK("__new_planner_todos"."urgency" IS NULL OR "__new_planner_todos"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "todos_interest_range" CHECK("__new_planner_todos"."interest" IS NULL OR "__new_planner_todos"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "todos_energy_range" CHECK("__new_planner_todos"."energy" IS NULL OR "__new_planner_todos"."energy" BETWEEN 1 AND 5)
);
--> statement-breakpoint
/*
 A todo's `completed` boolean becomes the same four-state status every other
 task uses, so the board can hold both kinds in one column. The column is kept
 alongside for now rather than dropped, so nothing that still reads it breaks
 mid-migration.
*/
INSERT INTO `__new_planner_todos`("id", "user_id", "title", "notes", "completed", "category_id", "scheduled_date", "status", "sort_order", "urgency", "interest", "energy", "created_at", "updated_at")
SELECT "id", "user_id", "title", "notes", "completed", NULL, NULL,
	CASE WHEN "completed" = 1 THEN 'done' ELSE 'todo' END,
	"id", NULL, NULL, NULL,
	"created_at", "updated_at" FROM `planner_todos`;--> statement-breakpoint
DROP TABLE `planner_todos`;--> statement-breakpoint
ALTER TABLE `__new_planner_todos` RENAME TO `planner_todos`;--> statement-breakpoint
CREATE INDEX `planner_todos_user_idx` ON `planner_todos` (`user_id`);--> statement-breakpoint
CREATE INDEX `planner_todos_scheduled_idx` ON `planner_todos` (`user_id`,`scheduled_date`);--> statement-breakpoint
ALTER TABLE `task_instances` ADD `urgency_override` integer;--> statement-breakpoint
ALTER TABLE `task_instances` ADD `interest_override` integer;--> statement-breakpoint
ALTER TABLE `task_instances` ADD `energy_override` integer;--> statement-breakpoint
CREATE TABLE `__new_weekly_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`urgency` integer,
	`interest` integer,
	`energy` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "slots_urgency_range" CHECK("__new_weekly_slots"."urgency" IS NULL OR "__new_weekly_slots"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "slots_interest_range" CHECK("__new_weekly_slots"."interest" IS NULL OR "__new_weekly_slots"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "slots_energy_range" CHECK("__new_weekly_slots"."energy" IS NULL OR "__new_weekly_slots"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "slots_weekday_range" CHECK("__new_weekly_slots"."weekday" >= 0 AND "__new_weekly_slots"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("__new_weekly_slots"."mode" != 'category' OR "__new_weekly_slots"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("__new_weekly_slots"."mode" != 'activity' OR "__new_weekly_slots"."activity_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_weekly_slots`("id", "user_id", "weekday", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "urgency", "interest", "energy", "meta", "created_at", "updated_at")
SELECT "id", "user_id", "weekday", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", NULL, NULL, NULL, "meta", "created_at", "updated_at" FROM `weekly_slots`;--> statement-breakpoint
DROP TABLE `weekly_slots`;--> statement-breakpoint
ALTER TABLE `__new_weekly_slots` RENAME TO `weekly_slots`;--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `weekly_slots` (`user_id`);--> statement-breakpoint
CREATE INDEX `slots_weekday_idx` ON `weekly_slots` (`weekday`);--> statement-breakpoint
CREATE INDEX `slots_weekday_time_idx` ON `weekly_slots` (`weekday`,`start_time`);