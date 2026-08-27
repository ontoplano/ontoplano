PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`plan` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'trialing' NOT NULL,
	`provider` text DEFAULT 'none' NOT NULL,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`current_period_end` text,
	`trial_ends_at` text,
	`cancel_at` text,
	`portal_url` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "user_id", "plan", "status", "provider", "provider_customer_id", "provider_subscription_id", "current_period_end", "trial_ends_at", "cancel_at", "portal_url", "created_at", "updated_at") SELECT "id", "user_id", "plan", "status", "provider", "provider_customer_id", "provider_subscription_id", "current_period_end", "trial_ends_at", "cancel_at", "portal_url", "created_at", "updated_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
-- The free tier is gone: self-hosting is the free version now. Rows that said
-- 'free' meant "not paying", which is what 'none' says. Hand-added, because the
-- generated migration copies values verbatim and would have left every existing
-- row holding a value the code no longer knows.
UPDATE `subscriptions` SET `plan` = 'none' WHERE `plan` = 'free';--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_user_unique` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_provider_idx` ON `subscriptions` (`provider_subscription_id`);