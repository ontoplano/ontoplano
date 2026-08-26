-- A note is numbered by its notebook.
--
-- `seq` counts every piece of writing in an account, which is what the diary's
-- `#12` references mean. A note inside a notebook is numbered by that notebook
-- as well, so the fourth note about the kitchen reads as #4 rather than #36.
--
-- Existing notes are numbered by when they were written, oldest first, so the
-- numbering matches what somebody reading the notebook would have counted.
ALTER TABLE `diary_entries` ADD `notebook_seq` integer;--> statement-breakpoint

UPDATE `diary_entries`
SET `notebook_seq` = (
	SELECT COUNT(*)
	FROM `diary_entries` AS earlier
	WHERE earlier.`notebook_id` = `diary_entries`.`notebook_id`
	  AND (
		earlier.`created_at` < `diary_entries`.`created_at`
		OR (earlier.`created_at` = `diary_entries`.`created_at` AND earlier.`id` <= `diary_entries`.`id`)
	  )
)
WHERE `notebook_id` IS NOT NULL;--> statement-breakpoint

-- SQLite treats NULLs as distinct, so every entry outside a notebook is exempt
-- and the numbering inside one cannot collide.
CREATE UNIQUE INDEX `diary_entries_notebook_seq_unique` ON `diary_entries` (`notebook_id`,`notebook_seq`);
