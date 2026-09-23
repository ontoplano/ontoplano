ALTER TABLE `bills` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `bills_notebook_idx` ON `bills` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `habits` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `habits_notebook_idx` ON `habits` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `ideas` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `ideas_notebook_idx` ON `ideas` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `inventory_items_notebook_idx` ON `inventory_items` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `ledgers` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `ledgers_notebook_idx` ON `ledgers` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `notebooks` ADD `modules` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `recipes_notebook_idx` ON `recipes` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `notebook_id` integer REFERENCES notebooks(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `workouts_notebook_idx` ON `workouts` (`notebook_id`);