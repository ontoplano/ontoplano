/**
 * The changes to somebody's data that SQL cannot express, run once each.
 *
 * A migration moves the shape of the database; now and then a release also has
 * to move what is *in* it, in a way `UPDATE` cannot say. The one this exists
 * for is rewriting references inside writing people have already done: SQLite's
 * `replace()` is literal and has no word boundary, so rewriting `#3` without
 * also mangling the `#30` two lines below it is not expressible — and the
 * alternative, leaving the references pointing at the wrong entries, is worse
 * than either.
 *
 * Each step runs once per database and records that it ran, the same bargain
 * drizzle's own journal makes. They must be safe to run against a database
 * that has already had them: the guard is the promise, not the only defence.
 *
 * A step also says what shape it needs, and waits — unrecorded — until the
 * migration that makes it has run. A database can legitimately be held at an
 * older migration, and a step that assumed otherwise failed the whole migrate
 * on a column that did not exist yet.
 *
 * Kept deliberately small. If a step can be written as SQL in the migration, it
 * belongs there instead — this is the exception, and a long list of exceptions
 * is a sign somebody stopped noticing.
 */

/** Where a step records that it has run. Created on first use. */
const LEDGER = `CREATE TABLE IF NOT EXISTS __data_steps (
	name text PRIMARY KEY NOT NULL,
	ran_at text NOT NULL
)`;

/**
 * `#12` inside a diary entry, rewritten to that entry's new diary number.
 *
 * Until 0.182.23 the number a diary entry showed was `seq`, the account's
 * numbering of everything it holds — notebook notes included — so the thirtieth
 * diary entry read `#127`. `0094_a_diary_entry_has_its_own_number` gives the
 * diary its own count, which is what the page draws now and what somebody types
 * when they mean "the entry about the boiler".
 *
 * Writing already done still says the old numbers. Left alone, every `#12` in
 * the diary would point at whichever entry now happens to be the twelfth —
 * which is precisely the silent repointing the numbering was built to prevent.
 * So they are rewritten here, once, by the mapping the migration just created.
 *
 * Only diary entries' own content: a `#12` in a notebook note renders as a link
 * to an anchor that exists on the diary page alone, so rewriting those changes
 * nothing anybody can follow, and touching less of somebody's writing is the
 * better default.
 */
function rewriteDiaryReferences(client) {
	const rows = client
		.prepare(
			`SELECT id, user_id, seq, diary_seq, content FROM diary_entries
			 WHERE diary_seq IS NOT NULL AND content LIKE '%#%'`
		)
		.all();
	if (rows.length === 0) return 0;

	/** user → old seq → new diary number. */
	const byUser = new Map();
	for (const row of client
		.prepare(`SELECT user_id, seq, diary_seq FROM diary_entries WHERE diary_seq IS NOT NULL`)
		.all()) {
		if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Map());
		byUser.get(row.user_id).set(row.seq, row.diary_seq);
	}

	const update = client.prepare(`UPDATE diary_entries SET content = ? WHERE id = ?`);
	let changed = 0;
	for (const row of rows) {
		const map = byUser.get(row.user_id);
		if (!map) continue;
		/*
		 * The same shape the renderer matches — `(^|[\s(])#\d+\b` — so a number
		 * this rewrites is exactly a number the app was drawing as a reference,
		 * and a `#12` glued to a word is left alone by both.
		 */
		const next = row.content.replace(/(^|[\s(])#(\d+)\b/g, (whole, before, digits) => {
			const to = map.get(Number(digits));
			return to === undefined ? whole : `${before}#${to}`;
		});
		if (next !== row.content) {
			update.run(next, row.id);
			changed++;
		}
	}
	return changed;
}

/** Whether a table has a column, which is how a step asks for its shape. */
function hasColumn(client, table, column) {
	return client
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.some((c) => c.name === column);
}

/** The steps, oldest first. A name is permanent: it is the record. */
const STEPS = [
	{
		name: '0094-diary-references',
		needs: (client) => hasColumn(client, 'diary_entries', 'diary_seq'),
		run: rewriteDiaryReferences
	}
];

/**
 * Run whatever has not run, and say what it did.
 *
 * Silence where there is nothing to do: a step that has already run is the
 * ordinary case on every deploy after the first.
 */
export function runDataSteps(client) {
	client.exec(LEDGER);
	const done = new Set(
		client
			.prepare('SELECT name FROM __data_steps')
			.all()
			.map((r) => r.name)
	);
	const record = client.prepare('INSERT INTO __data_steps (name, ran_at) VALUES (?, ?)');

	for (const step of STEPS) {
		if (done.has(step.name)) continue;
		// Not yet: its migration has not run here. Unrecorded, so it runs then.
		if (step.needs && !step.needs(client)) continue;
		const touched = client.transaction(() => {
			const n = step.run(client);
			record.run(step.name, new Date().toISOString());
			return n;
		})();
		console.log(`  data step ${step.name}: ${touched} row(s) changed`);
	}
}
