DROP INDEX `notebooks_user_title_unique`;--> statement-breakpoint
ALTER TABLE `notebooks` ADD `folder` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `notebooks_user_folder_title_unique` ON `notebooks` (`user_id`,`folder`,`title`);