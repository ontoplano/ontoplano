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
	`training_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "exceptional_urgency_range" CHECK("__new_exceptional_tasks"."urgency" IS NULL OR "__new_exceptional_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_interest_range" CHECK("__new_exceptional_tasks"."interest" IS NULL OR "__new_exceptional_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_energy_range" CHECK("__new_exceptional_tasks"."energy" IS NULL OR "__new_exceptional_tasks"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "exceptional_mode_category" CHECK("__new_exceptional_tasks"."mode" != 'category' OR "__new_exceptional_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("__new_exceptional_tasks"."mode" != 'activity' OR "__new_exceptional_tasks"."activity_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_training" CHECK("__new_exceptional_tasks"."mode" != 'training' OR "__new_exceptional_tasks"."training_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_exceptional_tasks`("id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "notebook_id", "urgency", "interest", "energy", "meta", "recipe_id", "training_id", "created_at") SELECT "id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "notebook_id", "urgency", "interest", "energy", "meta", "recipe_id", "training_id", "created_at" FROM `exceptional_tasks`;--> statement-breakpoint
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
	`training_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "slots_urgency_range" CHECK("__new_recurring_tasks"."urgency" IS NULL OR "__new_recurring_tasks"."urgency" BETWEEN 1 AND 5),
	CONSTRAINT "slots_interest_range" CHECK("__new_recurring_tasks"."interest" IS NULL OR "__new_recurring_tasks"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "slots_energy_range" CHECK("__new_recurring_tasks"."energy" IS NULL OR "__new_recurring_tasks"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "slots_weekday_range" CHECK("__new_recurring_tasks"."weekday" >= 0 AND "__new_recurring_tasks"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("__new_recurring_tasks"."mode" != 'category' OR "__new_recurring_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("__new_recurring_tasks"."mode" != 'activity' OR "__new_recurring_tasks"."activity_id" IS NOT NULL),
	CONSTRAINT "slots_mode_training" CHECK("__new_recurring_tasks"."mode" != 'training' OR "__new_recurring_tasks"."training_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_recurring_tasks`("id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "urgency", "interest", "energy", "meta", "recipe_id", "training_id", "created_at", "updated_at") SELECT "id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "urgency", "interest", "energy", "meta", "recipe_id", "training_id", "created_at", "updated_at" FROM `recurring_tasks`;--> statement-breakpoint
DROP TABLE `recurring_tasks`;--> statement-breakpoint
ALTER TABLE `__new_recurring_tasks` RENAME TO `recurring_tasks`;--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `recurring_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `slots_weekday_idx` ON `recurring_tasks` (`weekday`);--> statement-breakpoint
CREATE INDEX `slots_weekday_time_idx` ON `recurring_tasks` (`weekday`,`start_time`);