CREATE TABLE `bill_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`bill_id` integer NOT NULL,
	`period` text NOT NULL,
	`amount_expected` integer DEFAULT 0 NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`currency` text,
	`paid_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_payments_user_idx` ON `bill_payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `bill_payments_bill_idx` ON `bill_payments` (`bill_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payments_bill_period_unique` ON `bill_payments` (`bill_id`,`period`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_expected` integer DEFAULT 0 NOT NULL,
	`currency` text,
	`due_day` integer,
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
	CONSTRAINT "bills_rhythm_dueday" CHECK("bills"."due_day" IS NULL OR "bills"."due_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE INDEX `bills_user_idx` ON `bills` (`user_id`);--> statement-breakpoint
CREATE INDEX `bills_active_idx` ON `bills` (`user_id`,`active`);