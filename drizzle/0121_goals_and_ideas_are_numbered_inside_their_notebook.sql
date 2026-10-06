ALTER TABLE `goals` ADD `notebook_seq` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `goals_notebook_seq_unique` ON `goals` (`notebook_id`,`notebook_seq`);--> statement-breakpoint
ALTER TABLE `ideas` ADD `notebook_seq` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `ideas_notebook_seq_unique` ON `ideas` (`notebook_id`,`notebook_seq`);--> statement-breakpoint
-- Every goal already filed under a notebook gets its number there, in the order
-- it was written, as 0089 did for tasks.
WITH numbered AS (
	SELECT
		t.id AS id,
		ROW_NUMBER() OVER (PARTITION BY t.notebook_id ORDER BY t.id) AS seq
	FROM goals t
	WHERE t.notebook_id IS NOT NULL
)
UPDATE goals
SET notebook_seq = (SELECT seq FROM numbered WHERE numbered.id = goals.id)
WHERE id IN (SELECT id FROM numbered);--> statement-breakpoint
-- Every idea already filed under a notebook gets its number there, in the order
-- it was written, as 0089 did for tasks.
WITH numbered AS (
	SELECT
		t.id AS id,
		ROW_NUMBER() OVER (PARTITION BY t.notebook_id ORDER BY t.id) AS seq
	FROM ideas t
	WHERE t.notebook_id IS NOT NULL
)
UPDATE ideas
SET notebook_seq = (SELECT seq FROM numbered WHERE numbered.id = ideas.id)
WHERE id IN (SELECT id FROM numbered);
