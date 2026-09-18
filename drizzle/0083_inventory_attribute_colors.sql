CREATE TABLE `inventory_attribute_colors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_attribute_colors_user_idx` ON `inventory_attribute_colors` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_attribute_colors_unique` ON `inventory_attribute_colors` (`user_id`,`key`,`value`);
