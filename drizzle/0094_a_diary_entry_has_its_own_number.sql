ALTER TABLE `diary_entries` ADD `diary_seq` integer;--> statement-breakpoint
-- The diary's own numbering, for everything already written.
--
-- In `seq` order, so the oldest diary entry is #1 and the numbers run the way
-- the entries were written. Notebook notes keep their own numbering and take
-- none of these.
UPDATE `diary_entries` SET `diary_seq` = (
	SELECT COUNT(*) FROM `diary_entries` AS `earlier`
	WHERE `earlier`.`user_id` = `diary_entries`.`user_id`
		AND `earlier`.`notebook_id` IS NULL
		AND `earlier`.`notebook_seq` IS NULL
		AND `earlier`.`seq` <= `diary_entries`.`seq`
) WHERE `notebook_id` IS NULL AND `notebook_seq` IS NULL;--> statement-breakpoint
-- And the high-water mark the next entry counts from. A number is never
-- reused, so this is the highest ever given rather than the highest present.
INSERT INTO `user_settings` (`user_id`, `key`, `value`)
SELECT `user_id`, 'diary.number.highest', CAST(MAX(`diary_seq`) AS TEXT)
FROM `diary_entries` WHERE `diary_seq` IS NOT NULL GROUP BY `user_id`
ON CONFLICT(`user_id`, `key`) DO UPDATE SET `value` = excluded.`value`;
