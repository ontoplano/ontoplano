-- A goal is measured by several things, not one.
--
-- `target_value`, `current_value` and `unit` sat on the goal itself, which can
-- only ever describe one measure — and a goal that means anything is usually
-- several at once: three gigs played and five songs recorded is one commitment
-- with two numbers under it. Each measure is its own row now, and the goal is
-- as far along as its measures are on average.
--
-- Every goal that had a target keeps it, as its first and only measure; the
-- goals that had none simply have none. drizzle-kit writes the rebuild and
-- nothing else, so the data movement is by hand — and `tests/migrate-goal-targets.test.ts`
-- runs this against a filled database and reads what came out.

CREATE TABLE `goal_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` integer NOT NULL,
	`target_value` real NOT NULL,
	`current_value` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goal_targets_positive" CHECK("goal_targets"."target_value" > 0)
);
--> statement-breakpoint
CREATE INDEX `goal_targets_user_idx` ON `goal_targets` (`user_id`);--> statement-breakpoint
CREATE INDEX `goal_targets_goal_idx` ON `goal_targets` (`goal_id`);--> statement-breakpoint
INSERT INTO `goal_targets` ("user_id", "goal_id", "target_value", "current_value", "unit", "sort_order") SELECT "user_id", "id", "target_value", COALESCE("current_value", 0), COALESCE("unit", ''), 0 FROM `goals` WHERE "target_value" IS NOT NULL AND "target_value" > 0;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`status` text DEFAULT 'open' NOT NULL,
	`outcome` text DEFAULT '',
	`closed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_id`) REFERENCES `goal_areas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_goals`("id", "user_id", "area_id", "notebook_id", "parent_id", "title", "notes", "horizon", "period_start", "status", "outcome", "closed_at", "created_at", "updated_at") SELECT "id", "user_id", "area_id", "notebook_id", "parent_id", "title", "notes", "horizon", "period_start", "status", "outcome", "closed_at", "created_at", "updated_at" FROM `goals`;--> statement-breakpoint
DROP TABLE `goals`;--> statement-breakpoint
ALTER TABLE `__new_goals` RENAME TO `goals`;--> statement-breakpoint
CREATE INDEX `goals_user_idx` ON `goals` (`user_id`);--> statement-breakpoint
CREATE INDEX `goals_period_idx` ON `goals` (`user_id`,`horizon`,`period_start`);--> statement-breakpoint
CREATE INDEX `goals_parent_idx` ON `goals` (`parent_id`);--> statement-breakpoint
CREATE INDEX `goals_area_idx` ON `goals` (`area_id`);--> statement-breakpoint
CREATE INDEX `goals_notebook_idx` ON `goals` (`notebook_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
