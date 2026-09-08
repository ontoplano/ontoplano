-- A week's review is one note, not three lines.
--
-- Three boxes labelled "what went well", "what did not" and "what you will do
-- differently" made a form out of the one part of a review that is writing:
-- somebody with two things to say invented a third, and somebody with a
-- paragraph had nowhere to put it.
--
-- Nothing written is lost. The lines of each week are folded, in order, into
-- the row at position 1 — separated by blank lines, so a review that was three
-- sentences reads as three paragraphs.

-- First, weeks whose lines start at 2 or 3, because the first box was left
-- empty. They have nothing at position 1 to fold into, so the earliest line
-- they do have is moved down to be that row. Doing this before the fold rather
-- than after is the whole of it: after, the fold has already run without them
-- and the delete takes the rest away.
UPDATE weekly_reviews
SET position = 1
WHERE position > 1
  AND NOT EXISTS (
    SELECT 1 FROM weekly_reviews AS first
    WHERE first.user_id = weekly_reviews.user_id
      AND first.week_start = weekly_reviews.week_start
      AND first.position = 1
  )
  AND position = (
    SELECT MIN(w.position) FROM weekly_reviews AS w
    WHERE w.user_id = weekly_reviews.user_id
      AND w.week_start = weekly_reviews.week_start
  );
--> statement-breakpoint
-- Then fold every week that has more than one line into its first row.
UPDATE weekly_reviews
SET content = (
  SELECT group_concat(ordered.content, char(10) || char(10))
  FROM (
    SELECT content
    FROM weekly_reviews AS w
    WHERE w.user_id = weekly_reviews.user_id
      AND w.week_start = weekly_reviews.week_start
    ORDER BY w.position
  ) AS ordered
)
WHERE position = 1
  AND EXISTS (
    SELECT 1 FROM weekly_reviews AS other
    WHERE other.user_id = weekly_reviews.user_id
      AND other.week_start = weekly_reviews.week_start
      AND other.position > 1
  );
--> statement-breakpoint
DELETE FROM weekly_reviews WHERE position > 1;
