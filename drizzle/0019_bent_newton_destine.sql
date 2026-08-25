CREATE TABLE `billing_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`processed_at` text,
	`error` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_unique` ON `billing_events` (`provider`,`event_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
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
CREATE UNIQUE INDEX `subscriptions_user_unique` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_provider_idx` ON `subscriptions` (`provider_subscription_id`);