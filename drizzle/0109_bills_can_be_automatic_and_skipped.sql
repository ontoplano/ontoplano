ALTER TABLE `bill_payments` ADD `status` text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE `bill_payments` ADD `automatic` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `automatic` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `settled_through` text;