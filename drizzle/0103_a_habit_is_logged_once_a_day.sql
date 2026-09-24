-- A habit is done once on a given day, or it is not done.
--
-- Logging asked whether the day was already there and inserted if it was not,
-- which holds until two presses land together — a double tap on the heatmap,
-- a form sent twice, an assistant retrying — and then both read nothing and
-- both write. The day ended up logged twice: two squares' worth of credit for
-- one day, and a streak that counted it more than once.
--
-- The index is the fix, because it is the only place two requests cannot both
-- get past. Anything already doubled has to go first, or the index cannot be
-- built on a database that is in use.
--
-- Which of a day's rows is kept: the one somebody wrote a note on, and
-- otherwise the first one recorded. A duplicate made by a double press carries
-- no note, so in practice this keeps whichever row a person actually touched.
DELETE FROM `habit_occurrences`
WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT
			`id`,
			ROW_NUMBER() OVER (
				PARTITION BY `habit_id`, `date`
				ORDER BY (CASE WHEN COALESCE(`notes`, '') <> '' THEN 0 ELSE 1 END), `id`
			) AS `rn`
		FROM `habit_occurrences`
	)
	WHERE `rn` = 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_occurrences_once_a_day_idx` ON `habit_occurrences` (`habit_id`,`date`);
