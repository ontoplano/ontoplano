DROP TABLE `belief_evidence`;--> statement-breakpoint
DROP TABLE `belief_habits`;--> statement-breakpoint
DROP TABLE `belief_intensities`;--> statement-breakpoint
DROP TABLE `belief_relations`;--> statement-breakpoint
DROP TABLE `belief_tags`;--> statement-breakpoint
DROP TABLE `beliefs`;--> statement-breakpoint
DROP TABLE `evidence`;--> statement-breakpoint
DROP TABLE `graph_views`;--> statement-breakpoint
ALTER TABLE `exceptional_slots` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `weekly_slots` ADD `meta` text DEFAULT '{}' NOT NULL;