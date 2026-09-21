-- A task filed under a notebook before there were numbers gets one.
--
-- `notebook_seq` is what `TODO:#4` in a note means, and 0088 added the column
-- without filling it — so every task that already existed was unreferenceable.
-- Numbered by id, which is the order they were written in, and offset past
-- whatever is already numbered so nothing collides with the unique index.
WITH numbered AS (
	SELECT
		t.id AS id,
		(
			SELECT IFNULL(MAX(x.notebook_seq), 0)
			FROM todo_tasks x
			WHERE x.notebook_id = t.notebook_id
		) + ROW_NUMBER() OVER (PARTITION BY t.notebook_id ORDER BY t.id) AS seq
	FROM todo_tasks t
	WHERE t.notebook_id IS NOT NULL AND t.notebook_seq IS NULL
)
UPDATE todo_tasks
SET notebook_seq = (SELECT seq FROM numbered WHERE numbered.id = todo_tasks.id)
WHERE id IN (SELECT id FROM numbered);
