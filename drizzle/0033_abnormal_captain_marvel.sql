ALTER TABLE `exceptional_slots` RENAME TO `exceptional_tasks`;--> statement-breakpoint
ALTER TABLE `weekly_slots` RENAME TO `recurring_tasks`;--> statement-breakpoint
ALTER TABLE `task_instances` RENAME TO `task_records`;--> statement-breakpoint
ALTER TABLE `planner_todos` RENAME TO `todo_tasks`;--> statement-breakpoint
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
	`notebook_id` integer,
	`urgency` integer,
	`interest` integer,
	`energy` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`recipe_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "exceptional_urgency_range" CHECK("__new_exceptional_tasks"."urgency" IS NULL OR "__new_exceptional_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_interest_range" CHECK("__new_exceptional_tasks"."interest" IS NULL OR "__new_exceptional_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_energy_range" CHECK("__new_exceptional_tasks"."energy" IS NULL OR "__new_exceptional_tasks"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_mode_category" CHECK("__new_exceptional_tasks"."mode" != 'category' OR "__new_exceptional_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("__new_exceptional_tasks"."mode" != 'activity' OR "__new_exceptional_tasks"."activity_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_exceptional_tasks`("id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "notebook_id", "urgency", "interest", "energy", "meta", "recipe_id", "created_at") SELECT "id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "notebook_id", "urgency", "interest", "energy", "meta", "recipe_id", "created_at" FROM `exceptional_tasks`;--> statement-breakpoint
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
	`urgency` integer,
	`interest` integer,
	`energy` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`recipe_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "slots_urgency_range" CHECK("__new_recurring_tasks"."urgency" IS NULL OR "__new_recurring_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "slots_interest_range" CHECK("__new_recurring_tasks"."interest" IS NULL OR "__new_recurring_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "slots_energy_range" CHECK("__new_recurring_tasks"."energy" IS NULL OR "__new_recurring_tasks"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "slots_weekday_range" CHECK("__new_recurring_tasks"."weekday" >= 0 AND "__new_recurring_tasks"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("__new_recurring_tasks"."mode" != 'category' OR "__new_recurring_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("__new_recurring_tasks"."mode" != 'activity' OR "__new_recurring_tasks"."activity_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_recurring_tasks`("id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "urgency", "interest", "energy", "meta", "recipe_id", "created_at", "updated_at") SELECT "id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "urgency", "interest", "energy", "meta", "recipe_id", "created_at", "updated_at" FROM `recurring_tasks`;--> statement-breakpoint
DROP TABLE `recurring_tasks`;--> statement-breakpoint
ALTER TABLE `__new_recurring_tasks` RENAME TO `recurring_tasks`;--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `recurring_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `slots_weekday_idx` ON `recurring_tasks` (`weekday`);--> statement-breakpoint
CREATE INDEX `slots_weekday_time_idx` ON `recurring_tasks` (`weekday`,`start_time`);--> statement-breakpoint
CREATE TABLE `__new_task_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slot_id` integer,
	`exceptional_slot_id` integer,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`timing` text,
	`completed_at` text,
	`notes` text DEFAULT '',
	`resolved_activity_id` integer,
	`duration_override` integer,
	`label_override` text,
	`urgency_override` integer,
	`interest_override` integer,
	`energy_override` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `recurring_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exceptional_slot_id`) REFERENCES `exceptional_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "instance_has_exactly_one_source" CHECK(("__new_task_records"."slot_id" IS NULL) != ("__new_task_records"."exceptional_slot_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_task_records`("id", "user_id", "slot_id", "exceptional_slot_id", "scheduled_at", "status", "timing", "completed_at", "notes", "resolved_activity_id", "duration_override", "label_override", "urgency_override", "interest_override", "energy_override", "created_at") SELECT "id", "user_id", "slot_id", "exceptional_slot_id", "scheduled_at", "status", "timing", "completed_at", "notes", "resolved_activity_id", "duration_override", "label_override", "urgency_override", "interest_override", "energy_override", "created_at" FROM `task_records`;--> statement-breakpoint
DROP TABLE `task_records`;--> statement-breakpoint
ALTER TABLE `__new_task_records` RENAME TO `task_records`;--> statement-breakpoint
CREATE INDEX `instances_user_idx` ON `task_records` (`user_id`);--> statement-breakpoint
CREATE INDEX `instances_slot_idx` ON `task_records` (`slot_id`);--> statement-breakpoint
CREATE INDEX `instances_exceptional_idx` ON `task_records` (`exceptional_slot_id`);--> statement-breakpoint
CREATE INDEX `instances_scheduled_idx` ON `task_records` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `instances_status_idx` ON `task_records` (`status`);--> statement-breakpoint
CREATE INDEX `instances_slot_scheduled_idx` ON `task_records` (`slot_id`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `instances_exceptional_unique` ON `task_records` (`exceptional_slot_id`);--> statement-breakpoint
CREATE TABLE `__new_todo_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '',
	`completed` integer DEFAULT false NOT NULL,
	`category_id` integer,
	`notebook_id` integer,
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
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "todos_urgency_range" CHECK("__new_todo_tasks"."urgency" IS NULL OR "__new_todo_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "todos_interest_range" CHECK("__new_todo_tasks"."interest" IS NULL OR "__new_todo_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "todos_energy_range" CHECK("__new_todo_tasks"."energy" IS NULL OR "__new_todo_tasks"."energy" BETWEEN 1 AND 5)
);
--> statement-breakpoint
INSERT INTO `__new_todo_tasks`("id", "user_id", "title", "notes", "completed", "category_id", "notebook_id", "scheduled_date", "status", "sort_order", "urgency", "interest", "energy", "created_at", "updated_at") SELECT "id", "user_id", "title", "notes", "completed", "category_id", "notebook_id", "scheduled_date", "status", "sort_order", "urgency", "interest", "energy", "created_at", "updated_at" FROM `todo_tasks`;--> statement-breakpoint
DROP TABLE `todo_tasks`;--> statement-breakpoint
ALTER TABLE `__new_todo_tasks` RENAME TO `todo_tasks`;--> statement-breakpoint
CREATE INDEX `todo_tasks_user_idx` ON `todo_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_tasks_scheduled_idx` ON `todo_tasks` (`user_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `todo_tasks_notebook_idx` ON `todo_tasks` (`notebook_id`);--> statement-breakpoint
CREATE TABLE `__new_goal_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` integer NOT NULL,
	`slot_id` integer,
	`todo_id` integer,
	`activity_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `recurring_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`todo_id`) REFERENCES `todo_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goal_link_has_exactly_one_target" CHECK((CASE WHEN "__new_goal_links"."slot_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "__new_goal_links"."todo_id" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "__new_goal_links"."activity_id" IS NULL THEN 0 ELSE 1 END) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_goal_links`("id", "user_id", "goal_id", "slot_id", "todo_id", "activity_id") SELECT "id", "user_id", "goal_id", "slot_id", "todo_id", "activity_id" FROM `goal_links`;--> statement-breakpoint
DROP TABLE `goal_links`;--> statement-breakpoint
ALTER TABLE `__new_goal_links` RENAME TO `goal_links`;--> statement-breakpoint
CREATE INDEX `goal_links_user_idx` ON `goal_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `goal_links_goal_idx` ON `goal_links` (`goal_id`);--> statement-breakpoint
CREATE TABLE `__new_suppressed_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`slot_id` integer NOT NULL,
	`moved_to_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `recurring_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moved_to_id`) REFERENCES `exceptional_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_suppressed_slots`("id", "user_id", "date", "slot_id", "moved_to_id") SELECT "id", "user_id", "date", "slot_id", "moved_to_id" FROM `suppressed_slots`;--> statement-breakpoint
DROP TABLE `suppressed_slots`;--> statement-breakpoint
ALTER TABLE `__new_suppressed_slots` RENAME TO `suppressed_slots`;--> statement-breakpoint
CREATE INDEX `suppressed_slots_user_date_idx` ON `suppressed_slots` (`user_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `suppressed_slots_unique` ON `suppressed_slots` (`user_id`,`date`,`slot_id`);