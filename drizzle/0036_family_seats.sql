CREATE TABLE `plan_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_members_owner_idx` ON `plan_members` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_members_member_unique` ON `plan_members` (`member_id`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `seats` integer DEFAULT 1 NOT NULL;