-- The weekly review's week starts on the day the account's week starts on.
--
-- A review was always keyed on the Monday of its week, whatever day the
-- planner had been told the week begins. For anybody who had changed that,
-- the two disagreed about which week a day belonged to: a plan starting on
-- Saturday put Saturday at the head of a week, and the review put the same
-- Saturday at the tail of the week before. The plan and the record of it were
-- describing different seven days.
--
-- Written by hand because nothing about the schema changes — this moves rows.
-- Every review an account holds shifts by the same number of days, because the
-- distance from a Monday back to the account's own first day is a constant per
-- account. So it is a shift, not a merge: no two weeks fold into one and
-- nothing is lost. An account whose week already starts on Monday shifts by
-- zero and is untouched.
--
-- `week.firstDay` is 0 for Monday through 6 for Sunday (`settings.ts`), which
-- is not SQLite's `%w`; only the stored number is read here, so that does not
-- matter. The `% 7` keeps Monday at zero rather than seven.

UPDATE `weekly_reviews`
SET `week_start` = date(
	`week_start`,
	'-' || (
		(7 - CAST(
			COALESCE(
				(
					SELECT `value` FROM `user_settings`
					WHERE `user_settings`.`user_id` = `weekly_reviews`.`user_id`
					  AND `user_settings`.`key` = 'week.firstDay'
				),
				'0'
			) AS INTEGER
		)) % 7
	) || ' days'
)
WHERE `user_id` IN (
	SELECT `user_id` FROM `user_settings`
	WHERE `key` = 'week.firstDay' AND `value` <> '0'
);
