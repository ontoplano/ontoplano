CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`description` text DEFAULT '',
	`color` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `activities_user_idx` ON `activities` (`user_id`);
CREATE INDEX `activities_category_idx` ON `activities` (`category_id`);
CREATE INDEX `activities_active_idx` ON `activities` (`active`);
CREATE TABLE `belief_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`evidence_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `belief_evidence_belief_idx` ON `belief_evidence` (`belief_id`);
CREATE INDEX `belief_evidence_evidence_idx` ON `belief_evidence` (`evidence_id`);
CREATE TABLE `belief_habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`habit_id` integer NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `belief_habits_belief_idx` ON `belief_habits` (`belief_id`);
CREATE INDEX `belief_habits_habit_idx` ON `belief_habits` (`habit_id`);
CREATE TABLE `belief_intensities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "belief_intensities_value_range" CHECK("belief_intensities"."value" >= 1 AND "belief_intensities"."value" <= 10)
);

CREATE INDEX `belief_intensities_belief_idx` ON `belief_intensities` (`belief_id`);
CREATE INDEX `belief_intensities_date_idx` ON `belief_intensities` (`date`);
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

CREATE INDEX `belief_relations_source_idx` ON `belief_relations` (`source_belief_id`);
CREATE INDEX `belief_relations_target_idx` ON `belief_relations` (`target_belief_id`);
CREATE TABLE `belief_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`belief_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `belief_tags_belief_idx` ON `belief_tags` (`belief_id`);
CREATE INDEX `belief_tags_tag_idx` ON `belief_tags` (`tag_id`);
CREATE TABLE `beliefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`valence` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `beliefs_user_idx` ON `beliefs` (`user_id`);
CREATE INDEX `beliefs_created_idx` ON `beliefs` (`created_at`);
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`color_light` text DEFAULT '#f3f4f6' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);
CREATE UNIQUE INDEX `categories_user_name_unique` ON `categories` (`user_id`,`name`);
CREATE TABLE `diary_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`content` text NOT NULL,
	`for_date` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `diary_entries_user_idx` ON `diary_entries` (`user_id`);
CREATE INDEX `diary_entries_created_idx` ON `diary_entries` (`created_at`);
CREATE INDEX `diary_entries_for_date_idx` ON `diary_entries` (`for_date`);
CREATE UNIQUE INDEX `diary_entries_user_seq_unique` ON `diary_entries` (`user_id`,`seq`);
CREATE TABLE `diary_entry_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `diary_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `diary_entry_tags_entry_idx` ON `diary_entry_tags` (`entry_id`);
CREATE INDEX `diary_entry_tags_tag_idx` ON `diary_entry_tags` (`tag_id`);
CREATE TABLE `evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `evidence_user_idx` ON `evidence` (`user_id`);
CREATE INDEX `evidence_created_idx` ON `evidence` (`created_at`);
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

CREATE INDEX `exceptional_slots_user_date_idx` ON `exceptional_slots` (`user_id`,`date`);
CREATE TABLE `graph_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `graph_views_user_idx` ON `graph_views` (`user_id`);
CREATE TABLE `habit_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `habit_occurrences_habit_idx` ON `habit_occurrences` (`habit_id`);
CREATE INDEX `habit_occurrences_date_idx` ON `habit_occurrences` (`date`);
CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`type` text DEFAULT 'bad' NOT NULL,
	`scheduled_days` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `habits_user_idx` ON `habits` (`user_id`);
CREATE TABLE `idea_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idea_tags_idea_idx` ON `idea_tags` (`idea_id`);
CREATE INDEX `idea_tags_tag_idx` ON `idea_tags` (`tag_id`);
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

CREATE INDEX `ideas_user_idx` ON `ideas` (`user_id`);
CREATE INDEX `ideas_created_idx` ON `ideas` (`created_at`);
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

CREATE INDEX `planner_todos_user_idx` ON `planner_todos` (`user_id`);
CREATE TABLE `planning_schemes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `schemes_user_idx` ON `planning_schemes` (`user_id`);
CREATE UNIQUE INDEX `schemes_user_name_unique` ON `planning_schemes` (`user_id`,`name`);
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

CREATE INDEX `scheme_slots_scheme_idx` ON `scheme_slots` (`scheme_id`);
CREATE TABLE `shopping_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `shopping_categories_user_idx` ON `shopping_categories` (`user_id`);
CREATE UNIQUE INDEX `shopping_categories_user_name_unique` ON `shopping_categories` (`user_id`,`name`);
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

CREATE INDEX `shopping_items_user_idx` ON `shopping_items` (`user_id`);
CREATE INDEX `shopping_items_type_idx` ON `shopping_items` (`type`);
CREATE INDEX `shopping_items_bought_idx` ON `shopping_items` (`bought`);
CREATE INDEX `shopping_items_snoozed_idx` ON `shopping_items` (`snoozed`);
CREATE INDEX `shopping_items_category_idx` ON `shopping_items` (`shopping_category_id`);
CREATE TABLE `suppressed_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`slot_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `suppressed_slots_user_date_idx` ON `suppressed_slots` (`user_id`,`date`);
CREATE UNIQUE INDEX `suppressed_slots_unique` ON `suppressed_slots` (`user_id`,`date`,`slot_id`);
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `tags_user_idx` ON `tags` (`user_id`);
CREATE UNIQUE INDEX `tags_user_name_unique` ON `tags` (`user_id`,`name`);
CREATE TABLE `task_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slot_id` integer NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`notes` text DEFAULT '',
	`resolved_activity_id` integer,
	`duration_override` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `instances_user_idx` ON `task_instances` (`user_id`);
CREATE INDEX `instances_slot_idx` ON `task_instances` (`slot_id`);
CREATE INDEX `instances_scheduled_idx` ON `task_instances` (`scheduled_at`);
CREATE INDEX `instances_status_idx` ON `task_instances` (`status`);
CREATE INDEX `instances_slot_scheduled_idx` ON `task_instances` (`slot_id`,`scheduled_at`);
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `user_settings_user_key_unique` ON `user_settings` (`user_id`,`key`);
CREATE INDEX `user_settings_user_idx` ON `user_settings` (`user_id`);
CREATE TABLE `weekly_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "slots_weekday_range" CHECK("weekly_slots"."weekday" >= 0 AND "weekly_slots"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("weekly_slots"."mode" != 'category' OR "weekly_slots"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("weekly_slots"."mode" != 'activity' OR "weekly_slots"."activity_id" IS NOT NULL)
);

CREATE INDEX `slots_user_idx` ON `weekly_slots` (`user_id`);
CREATE INDEX `slots_weekday_idx` ON `weekly_slots` (`weekday`);
CREATE INDEX `slots_weekday_time_idx` ON `weekly_slots` (`weekday`,`start_time`);
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);

CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);

CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
