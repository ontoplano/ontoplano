-- The rebuild copies rows out of the table as it stands, and `due_month` is
-- the column being added — it cannot be read from the old one. NULL is the
-- value every existing bill should get anyway: only a yearly bill has a month.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_expected` integer DEFAULT 0 NOT NULL,
	`currency` text,
	`due_day` integer,
	`due_month` integer,
	`pay_lead_days` integer DEFAULT 0 NOT NULL,
	`rhythm` text DEFAULT 'monthly' NOT NULL,
	`category_id` integer,
	`goal_id` integer,
	`notes` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bills_rhythm_dueday" CHECK("__new_bills"."due_day" IS NULL OR "__new_bills"."due_day" BETWEEN 1 AND 28),
	CONSTRAINT "bills_rhythm_duemonth" CHECK("__new_bills"."due_month" IS NULL OR "__new_bills"."due_month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
INSERT INTO `__new_bills`("id", "user_id", "name", "amount_expected", "currency", "due_day", "due_month", "pay_lead_days", "rhythm", "category_id", "goal_id", "notes", "active", "sort_order", "created_at", "updated_at") SELECT "id", "user_id", "name", "amount_expected", "currency", "due_day", NULL, "pay_lead_days", "rhythm", "category_id", "goal_id", "notes", "active", "sort_order", "created_at", "updated_at" FROM `bills`;--> statement-breakpoint
DROP TABLE `bills`;--> statement-breakpoint
ALTER TABLE `__new_bills` RENAME TO `bills`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bills_user_idx` ON `bills` (`user_id`);--> statement-breakpoint
CREATE INDEX `bills_active_idx` ON `bills` (`user_id`,`active`);