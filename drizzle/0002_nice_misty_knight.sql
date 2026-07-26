CREATE TABLE `belief_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`evidence_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `belief_evidence_belief_idx` ON `belief_evidence` (`belief_id`);--> statement-breakpoint
CREATE INDEX `belief_evidence_evidence_idx` ON `belief_evidence` (`evidence_id`);--> statement-breakpoint
CREATE TABLE `belief_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_belief_id` integer NOT NULL,
	`target_belief_id` integer NOT NULL,
	`type` text NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`source_belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `belief_relations_source_idx` ON `belief_relations` (`source_belief_id`);--> statement-breakpoint
CREATE INDEX `belief_relations_target_idx` ON `belief_relations` (`target_belief_id`);--> statement-breakpoint
CREATE TABLE `belief_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `belief_tags_belief_idx` ON `belief_tags` (`belief_id`);--> statement-breakpoint
CREATE INDEX `belief_tags_tag_idx` ON `belief_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_user_idx` ON `evidence` (`user_id`);--> statement-breakpoint
CREATE INDEX `evidence_created_idx` ON `evidence` (`created_at`);--> statement-breakpoint
CREATE TABLE `exceptional_slots` (
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
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`notes` text DEFAULT '',
	`resolved_activity_id` integer,
	`duration_override` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exceptional_mode_category" CHECK("exceptional_slots"."mode" != 'category' OR "exceptional_slots"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("exceptional_slots"."mode" != 'activity' OR "exceptional_slots"."activity_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `exceptional_slots_user_date_idx` ON `exceptional_slots` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `graph_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `graph_views_user_idx` ON `graph_views` (`user_id`);--> statement-breakpoint
CREATE TABLE `idea_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idea_tags_idea_idx` ON `idea_tags` (`idea_id`);--> statement-breakpoint
CREATE INDEX `idea_tags_tag_idx` ON `idea_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`is_applied` integer DEFAULT false NOT NULL,
	`applied_note` text,
	`favorite` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ideas_user_idx` ON `ideas` (`user_id`);--> statement-breakpoint
CREATE INDEX `ideas_created_idx` ON `ideas` (`created_at`);--> statement-breakpoint
CREATE TABLE `planner_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '',
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planner_todos_user_idx` ON `planner_todos` (`user_id`);--> statement-breakpoint
CREATE TABLE `planning_schemes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `schemes_user_idx` ON `planning_schemes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schemes_user_name_unique` ON `planning_schemes` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `scheme_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheme_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`scheme_id`) REFERENCES `planning_schemes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scheme_slots_scheme_idx` ON `scheme_slots` (`scheme_id`);--> statement-breakpoint
CREATE TABLE `shopping_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shopping_categories_user_idx` ON `shopping_categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_categories_user_name_unique` ON `shopping_categories` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`shopping_category_id` integer,
	`notes` text DEFAULT '',
	`bought` integer DEFAULT false NOT NULL,
	`bought_at` text,
	`snoozed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shopping_category_id`) REFERENCES `shopping_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shopping_items_user_idx` ON `shopping_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `shopping_items_type_idx` ON `shopping_items` (`type`);--> statement-breakpoint
CREATE INDEX `shopping_items_bought_idx` ON `shopping_items` (`bought`);--> statement-breakpoint
CREATE INDEX `shopping_items_snoozed_idx` ON `shopping_items` (`snoozed`);--> statement-breakpoint
CREATE INDEX `shopping_items_category_idx` ON `shopping_items` (`shopping_category_id`);--> statement-breakpoint
CREATE TABLE `suppressed_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`slot_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suppressed_slots_user_date_idx` ON `suppressed_slots` (`user_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `suppressed_slots_unique` ON `suppressed_slots` (`user_id`,`date`,`slot_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_key_unique` ON `user_settings` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `user_settings_user_idx` ON `user_settings` (`user_id`);--> statement-breakpoint
DROP TABLE `belief_contradictions`;--> statement-breakpoint
DROP TABLE `belief_reasons`;--> statement-breakpoint
DROP INDEX `categories_name_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `categories` ADD `color` text DEFAULT '#6b7280' NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `color_light` text DEFAULT '#f3f4f6' NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_unique` ON `categories` (`user_id`,`name`);--> statement-breakpoint
DROP INDEX `tags_name_unique`;--> statement-breakpoint
ALTER TABLE `tags` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `tags_user_idx` ON `tags` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_name_unique` ON `tags` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `activities` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `activities_user_idx` ON `activities` (`user_id`);--> statement-breakpoint
ALTER TABLE `beliefs` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `beliefs` ADD `valence` text;--> statement-breakpoint
CREATE INDEX `beliefs_user_idx` ON `beliefs` (`user_id`);--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `diary_entries` ADD `for_date` text;--> statement-breakpoint
CREATE INDEX `diary_entries_user_idx` ON `diary_entries` (`user_id`);--> statement-breakpoint
CREATE INDEX `diary_entries_for_date_idx` ON `diary_entries` (`for_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `diary_entries_user_seq_unique` ON `diary_entries` (`user_id`,`seq`);--> statement-breakpoint
ALTER TABLE `habits` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `habits_user_idx` ON `habits` (`user_id`);--> statement-breakpoint
ALTER TABLE `task_instances` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `instances_user_idx` ON `task_instances` (`user_id`);--> statement-breakpoint
ALTER TABLE `weekly_slots` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `weekly_slots` (`user_id`);