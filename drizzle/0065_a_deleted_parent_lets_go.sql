-- Four foreign keys promise SET NULL and the shipped tables never got it.
--
-- The schema declares that deleting a workout category, a notebook or a
-- person's picture unlinks what pointed at it — `deleteWorkoutCategory` says
-- as much: "the workouts in it keep existing and simply have no kind". But no
-- migration ever carried the action, so a database built from this directory
-- refuses those deletes outright, while one built by `drizzle-kit push` (every
-- unit test) honours them. The demo's sweep was where it surfaced: a seeded
-- account has workouts filed under categories, and the account walk hit
-- `FOREIGN KEY constraint failed` every round.
--
-- SQLite cannot change a foreign key's action in place, so each table is
-- rebuilt around it, the way `audit_events` was in 0064.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category_id` integer,
	`plan` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '',
	`minutes` integer,
	`last_done_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `workout_categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workouts_minutes_positive" CHECK("minutes" IS NULL OR "minutes" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_workouts`("id", "user_id", "title", "category_id", "plan", "notes", "minutes", "last_done_at", "archived_at", "created_at", "updated_at") SELECT "id", "user_id", "title", "category_id", "plan", "notes", "minutes", "last_done_at", "archived_at", "created_at", "updated_at" FROM `workouts`;--> statement-breakpoint
DROP TABLE `workouts`;--> statement-breakpoint
ALTER TABLE `__new_workouts` RENAME TO `workouts`;--> statement-breakpoint
CREATE INDEX `workouts_user_idx` ON `workouts` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text DEFAULT 'other' NOT NULL,
	`birthday` text,
	`remind_on_birthday` integer DEFAULT true NOT NULL,
	`phone` text,
	`email` text,
	`notes` text DEFAULT '',
	`picture_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`picture_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_people`("id", "user_id", "name", "relationship", "birthday", "remind_on_birthday", "phone", "email", "notes", "picture_id", "created_at", "updated_at") SELECT "id", "user_id", "name", "relationship", "birthday", "remind_on_birthday", "phone", "email", "notes", "picture_id", "created_at", "updated_at" FROM `people`;--> statement-breakpoint
DROP TABLE `people`;--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;--> statement-breakpoint
CREATE INDEX `people_user_idx` ON `people` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_user_name_unique` ON `people` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `__new_diary_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`notebook_seq` integer,
	`content` text NOT NULL,
	`for_date` text,
	`notebook_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_diary_entries`("id", "user_id", "seq", "notebook_seq", "content", "for_date", "notebook_id", "created_at", "updated_at") SELECT "id", "user_id", "seq", "notebook_seq", "content", "for_date", "notebook_id", "created_at", "updated_at" FROM `diary_entries`;--> statement-breakpoint
DROP TABLE `diary_entries`;--> statement-breakpoint
ALTER TABLE `__new_diary_entries` RENAME TO `diary_entries`;--> statement-breakpoint
CREATE INDEX `diary_entries_created_idx` ON `diary_entries` (`created_at`);--> statement-breakpoint
CREATE INDEX `diary_entries_for_date_idx` ON `diary_entries` (`for_date`);--> statement-breakpoint
CREATE INDEX `diary_entries_notebook_idx` ON `diary_entries` (`notebook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `diary_entries_notebook_seq_unique` ON `diary_entries` (`notebook_id`,`notebook_seq`);--> statement-breakpoint
CREATE INDEX `diary_entries_user_idx` ON `diary_entries` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `diary_entries_user_seq_unique` ON `diary_entries` (`user_id`,`seq`);--> statement-breakpoint
CREATE TABLE `__new_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`area_id` integer,
	`notebook_id` integer,
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
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "goals_target_positive" CHECK("target_value" IS NULL OR "target_value" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_goals`("id", "user_id", "area_id", "notebook_id", "parent_id", "title", "notes", "horizon", "period_start", "target_value", "current_value", "unit", "status", "outcome", "closed_at", "created_at", "updated_at") SELECT "id", "user_id", "area_id", "notebook_id", "parent_id", "title", "notes", "horizon", "period_start", "target_value", "current_value", "unit", "status", "outcome", "closed_at", "created_at", "updated_at" FROM `goals`;--> statement-breakpoint
DROP TABLE `goals`;--> statement-breakpoint
ALTER TABLE `__new_goals` RENAME TO `goals`;--> statement-breakpoint
CREATE INDEX `goals_area_idx` ON `goals` (`area_id`);--> statement-breakpoint
CREATE INDEX `goals_notebook_idx` ON `goals` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `goals_parent_idx` ON `goals` (`parent_id`);--> statement-breakpoint
CREATE INDEX `goals_period_idx` ON `goals` (`user_id`,`horizon`,`period_start`);--> statement-breakpoint
CREATE INDEX `goals_user_idx` ON `goals` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
