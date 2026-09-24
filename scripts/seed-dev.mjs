/**
 * Synthetic development data.
 *
 * The container never has access to the real database, so any feature that
 * needs plausible content to look at gets it from here. Everything this writes
 * is invented; nothing is derived from real user data.
 *
 * **Every feature that stores something seeds it here.** A section that is
 * empty in the dev database is a screen nobody ever sees in a used state — see
 * the rule in `CONTRIBUTING.md`.
 *
 * Usage:
 *   node scripts/seed-dev.mjs <path-to-dev.db> [email]
 *
 * Expects the schema to exist (`yarn db:migrate`) and a registered user. It
 * seeds `dev@ontoplano.test` when that account exists, otherwise the first user
 * it finds. Re-runnable: every write is get-or-create.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

/** This script's own directory, which is where the demo pictures live. */
const here = dirname(fileURLToPath(import.meta.url));

const path = process.argv[2];
const wantedEmail = process.argv[3] ?? 'dev@ontoplano.test';

if (!path) {
	console.error('usage: node scripts/seed-dev.mjs <path-to-dev.db> [email]');
	process.exit(1);
}

const db = new Database(path);

const user =
	db.prepare('select id, email from user where email = ?').get(wantedEmail) ??
	db.prepare('select id, email from user limit 1').get();

if (!user) {
	console.error('no user found — register one through /login first');
	process.exit(1);
}
const uid = user.id;

// --- dates --------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

const now = new Date();
const today = iso(now);
const dayOffset = (n) => {
	const d = new Date(now);
	d.setDate(d.getDate() + n);
	return d;
};
const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const yearStart = `${now.getFullYear()}-01-01`;
const quarterStart = `${now.getFullYear()}-${pad(Math.floor(now.getMonth() / 3) * 3 + 1)}-01`;
const monday = (() => {
	const d = new Date(now);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return iso(d);
})();

// --- get-or-create helpers ------------------------------------------------------

const one = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args).lastInsertRowid;

const setting = (key, value) => {
	const existing = one('select id from user_settings where user_id = ? and key = ?', uid, key);
	if (existing) {
		db.prepare('update user_settings set value = ? where id = ?').run(value, existing.id);
		return existing.id;
	}
	return run('insert into user_settings (user_id, key, value) values (?, ?, ?)', uid, key, value);
};

const category = (name, color, colorLight) => {
	const existing = one('select id from categories where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into categories (user_id, name, color, color_light) values (?, ?, ?, ?)',
		uid,
		name,
		color,
		colorLight
	);
};

const activity = (name, categoryId) => {
	const existing = one('select id from activities where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into activities (user_id, name, category_id, description) values (?, ?, ?, ?)',
		uid,
		name,
		categoryId,
		''
	);
};

const slot = (weekday, startTime, durationMinutes, activityId, recurrence = 'weekly') => {
	const existing = one(
		'select id from recurring_tasks where user_id = ? and weekday = ? and start_time = ? and activity_id = ?',
		uid,
		weekday,
		startTime,
		activityId
	);
	if (existing) return existing.id;
	return run(
		`insert into recurring_tasks
		 (user_id, weekday, start_time, duration_minutes, mode, activity_id, label, recurrence, meta)
		 values (?, ?, ?, ?, 'activity', ?, '', ?, '{}')`,
		uid,
		weekday,
		startTime,
		durationMinutes,
		activityId,
		recurrence
	);
};

/** A block that names only an area of life, resolved to an activity when done. */
const categorySlot = (weekday, startTime, durationMinutes, categoryId, label) => {
	const existing = one(
		'select id from recurring_tasks where user_id = ? and weekday = ? and start_time = ? and label = ?',
		uid,
		weekday,
		startTime,
		label
	);
	if (existing) return existing.id;
	return run(
		`insert into recurring_tasks
		 (user_id, weekday, start_time, duration_minutes, mode, category_id, label, recurrence, meta)
		 values (?, ?, ?, ?, 'category', ?, ?, 'weekly', '{}')`,
		uid,
		weekday,
		startTime,
		durationMinutes,
		categoryId,
		label
	);
};

const oneOff = (date, startTime, durationMinutes, activityId, label) => {
	const existing = one(
		'select id from exceptional_tasks where user_id = ? and date = ? and start_time = ?',
		uid,
		date,
		startTime
	);
	if (existing) return existing.id;
	return run(
		`insert into exceptional_tasks
		 (user_id, date, start_time, duration_minutes, mode, activity_id, label, meta)
		 values (?, ?, ?, ?, 'activity', ?, ?, '{}')`,
		uid,
		date,
		startTime,
		durationMinutes,
		activityId,
		label
	);
};

/** A one-off that names an area rather than a specific activity. */
const oneOffInCategory = (date, startTime, durationMinutes, categoryId, label) => {
	const existing = one(
		'select id from exceptional_tasks where user_id = ? and date = ? and start_time = ?',
		uid,
		date,
		startTime
	);
	if (existing) return existing.id;
	return run(
		`insert into exceptional_tasks
		 (user_id, date, start_time, duration_minutes, mode, category_id, label, meta)
		 values (?, ?, ?, ?, 'category', ?, ?, '{}')`,
		uid,
		date,
		startTime,
		durationMinutes,
		categoryId,
		label
	);
};

const todo = (title, extra = {}) => {
	const existing = one('select id from todo_tasks where user_id = ? and title = ?', uid, title);
	if (existing) {
		tagTodo(existing.id, extra.tags ?? []);
		return existing.id;
	}
	const id = run(
		`insert into todo_tasks
		 (user_id, title, notes, status, completed, scheduled_date, category_id, urgency, interest, ease, sort_order)
		 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		title,
		extra.notes ?? '',
		extra.status ?? 'todo',
		extra.status === 'done' ? 1 : 0,
		extra.scheduledDate ?? null,
		extra.categoryId ?? null,
		extra.urgency ?? null,
		extra.interest ?? null,
		extra.ease ?? null,
		extra.sortOrder ?? 0
	);
	tagTodo(id, extra.tags ?? []);
	return id;
};

const notebook = (title, description, closed = false) => {
	const existing = one('select id from notebooks where user_id = ? and title = ?', uid, title);
	if (existing) return existing.id;
	return run(
		`insert into notebooks (user_id, title, description, closed_at, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?)`,
		uid,
		title,
		description,
		closed ? stamp(dayOffset(-20)) : null,
		stamp(dayOffset(-60)),
		stamp(now)
	);
};

/**
 * A note written straight into a notebook, and a task filed in one.
 *
 * The other two helpers make a thing and `inNotebook` moves it afterwards,
 * which is right for the handful the seed names one at a time and wrong for a
 * notebook meant to look lived in: twenty notes is twenty names to invent and
 * twenty moves to write. These take the notebook first, because that is the
 * fact about them, and leave the numbering to `renumber` at the end.
 */
const notebookNote = (notebookId, content, tags = [], extra = {}) => {
	const existing = one(
		'select id from diary_entries where user_id = ? and content = ?',
		uid,
		content
	);
	const seq = (one('select max(seq) v from diary_entries where user_id = ?', uid)?.v ?? 0) + 1;
	const id =
		existing?.id ??
		run(
			`insert into diary_entries (user_id, seq, content, notebook_id, for_date, pinned_at)
			 values (?, ?, ?, ?, ?, ?)`,
			uid,
			seq,
			content,
			notebookId,
			extra.forDate ?? null,
			extra.pinned ? stamp(dayOffset(-1)) : null
		);
	for (const name of tags) {
		const tagId = tag(name);
		if (!one('select id from diary_entry_tags where entry_id = ? and tag_id = ?', id, tagId))
			run(
				'insert into diary_entry_tags (user_id, entry_id, tag_id) values (?, ?, ?)',
				uid,
				id,
				tagId
			);
	}
	return id;
};

const notebookTodo = (notebookId, title, extra = {}) => {
	const id = todo(title, extra);
	run('update todo_tasks set notebook_id = ? where id = ?', notebookId, id);
	return id;
};

/** Number what is in a notebook, once everything is in it. */
const renumber = (notebookId) => {
	for (const table of ['diary_entries', 'todo_tasks']) {
		run(
			`update ${table} set notebook_seq = null where user_id = ? and notebook_id = ?`,
			uid,
			notebookId
		);
		db.prepare(`select id from ${table} where user_id = ? and notebook_id = ? order by id`)
			.all(uid, notebookId)
			.forEach((row, i) => {
				db.prepare(`update ${table} set notebook_seq = ? where id = ?`).run(i + 1, row.id);
			});
	}
};

/** The tables whose rows are numbered inside their notebook as well as overall. */
const NUMBERED_IN_NOTEBOOK = ['diary_entries', 'todo_tasks'];

/** Point an already-seeded row at a notebook, by whatever identifies it here. */
const inNotebook = (table, column, value, notebookId) => {
	const numbered = NUMBERED_IN_NOTEBOOK.includes(table);

	// The number goes with the notebook: (notebook_id, notebook_seq) is unique,
	// so carrying an old number into a new notebook collides with whatever
	// already holds it there. Cleared in the same statement that moves it.
	run(
		`update ${table} set notebook_id = ?${numbered ? ', notebook_seq = null' : ''} where user_id = ? and ${column} = ?`,
		notebookId,
		uid,
		value
	);

	// A note is numbered by its notebook as well as by the account, and the
	// pair is unique. Numbering only the row just moved collides as soon as a
	// notebook holds more than one: the count it lands on is already taken.
	// So the whole notebook is renumbered, cleared first — an UPDATE walks the
	// rows one at a time and would otherwise trip over a number it has not
	// reached yet.
	//
	// Tasks are numbered the same way, and were not: a seeded notebook's tasks
	// had no number on their cards, and `TASK:#4` in a note beside them
	// pointed at nothing.
	if (numbered) {
		run(
			`update ${table} set notebook_seq = null where user_id = ? and notebook_id = ?`,
			uid,
			notebookId
		);
		const inBook = db
			.prepare(`select id from ${table} where user_id = ? and notebook_id = ? order by id`)
			.all(uid, notebookId);
		inBook.forEach((row, i) => {
			db.prepare(`update ${table} set notebook_seq = ? where id = ?`).run(i + 1, row.id);
		});
	}
};

/**
 * A note whose notebook was deleted.
 *
 * It has a notebook number and no notebook, which is what puts it in "Notes
 * without a notebook" rather than in the journal. Seeded so that section is
 * visible in development, where nobody has deleted anything.
 */
const orphanNote = (content) => {
	const existing = one(
		'select id from diary_entries where user_id = ? and content = ?',
		uid,
		content
	);
	if (existing) return existing.id;

	const seq = (one('select max(seq) v from diary_entries where user_id = ?', uid)?.v ?? 0) + 1;
	return run(
		'insert into diary_entries (user_id, seq, content, notebook_seq) values (?, ?, ?, 1)',
		uid,
		seq,
		content
	);
};

const tag = (name) => {
	const existing = one('select id from tags where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run('insert into tags (user_id, name) values (?, ?)', uid, name);
};

/**
 * Labels on a task, from the account's one vocabulary.
 *
 * Seeded so the to-do room has a labelled list to draw and a picker with
 * something in it — a filter nobody can see working is where the layout bugs
 * hide. `a1` is here on purpose: it is what an assistant working the list
 * marks its own work with.
 */
const tagTodo = (id, names) => {
	for (const name of names) {
		const tagId = tag(name);
		if (!one('select id from todo_tags where todo_id = ? and tag_id = ?', id, tagId))
			run('insert into todo_tags (user_id, todo_id, tag_id) values (?, ?, ?)', uid, id, tagId);
	}
};

/*
 * `pinned` puts one at the top of its notebook, because a seeded instance
 * that has never pinned anything does not show that a notebook can have a
 * thing worth keeping above the rest of it.
 */
const diary = (seq, content, tags = [], forDate = null, extra = {}) => {
	const existing = one('select id from diary_entries where user_id = ? and seq = ?', uid, seq);
	const id =
		existing?.id ??
		run(
			'insert into diary_entries (user_id, seq, content, for_date, pinned_at) values (?, ?, ?, ?, ?)',
			uid,
			seq,
			content,
			forDate,
			extra.pinned ? stamp(dayOffset(-1)) : null
		);
	for (const name of tags) {
		const tagId = tag(name);
		if (!one('select id from diary_entry_tags where entry_id = ? and tag_id = ?', id, tagId))
			run(
				'insert into diary_entry_tags (user_id, entry_id, tag_id) values (?, ?, ?)',
				uid,
				id,
				tagId
			);
	}
	return id;
};

const idea = (content, tags = [], extra = {}) => {
	const existing = one('select id from ideas where user_id = ? and content = ?', uid, content);
	const id =
		existing?.id ??
		run(
			'insert into ideas (user_id, content, is_applied, applied_note, favorite) values (?, ?, ?, ?, ?)',
			uid,
			content,
			extra.applied ? 1 : 0,
			extra.appliedNote ?? null,
			extra.favorite ? 1 : 0
		);
	for (const name of tags) {
		const tagId = tag(name);
		if (!one('select id from idea_tags where idea_id = ? and tag_id = ?', id, tagId))
			run('insert into idea_tags (user_id, idea_id, tag_id) values (?, ?, ?)', uid, id, tagId);
	}
	return id;
};

// contact: { birthday, phone, email } — all optional, and the dev database
// carries at least one of each shape, including a birthday with no year.
const person = (name, relationship, notes = '', contact = {}) => {
	const existing = one('select id from people where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		`insert into people (user_id, name, relationship, birthday, phone, email, notes, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		name,
		relationship,
		contact.birthday ?? null,
		contact.phone ?? null,
		contact.email ?? null,
		notes,
		stamp(now),
		stamp(now)
	);
};

/**
 * Somebody named in an entry, found by the entry's `seq`.
 *
 * By seq rather than by row id: seq is the number the seed itself hands out
 * (`diary(4, …)`) and the only stable handle a call site can name. It used to
 * pass that number straight into `entry_id`, which worked solely because a
 * long-lived dev database had grown ids that matched — on a database seeded
 * from scratch, the foreign key refused it.
 */
const mention = (seq, personId) => {
	const entry = one('select id from diary_entries where user_id = ? and seq = ?', uid, seq);
	if (!entry) return;
	if (one('select id from entry_people where entry_id = ? and person_id = ?', entry.id, personId))
		return;
	run(
		'insert into entry_people (user_id, entry_id, person_id) values (?, ?, ?)',
		uid,
		entry.id,
		personId
	);
};

const habit = (name, type, scheduledDays, description = '') => {
	const existing = one('select id from habits where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into habits (user_id, name, description, type, scheduled_days) values (?, ?, ?, ?, ?)',
		uid,
		name,
		description,
		type,
		scheduledDays
	);
};

const logHabit = (habitId, date, notes = '') => {
	if (one('select id from habit_occurrences where habit_id = ? and date = ?', habitId, date))
		return;
	run(
		'insert into habit_occurrences (user_id, habit_id, date, notes) values (?, ?, ?, ?)',
		uid,
		habitId,
		date,
		notes
	);
};

const shoppingCategory = (name, sortOrder) => {
	const existing = one(
		'select id from inventory_categories where user_id = ? and name = ?',
		uid,
		name
	);
	if (existing) return existing.id;
	return run(
		'insert into inventory_categories (user_id, name, sort_order) values (?, ?, ?)',
		uid,
		name,
		sortOrder
	);
};

/*
 * How many you have, and how many you keep.
 *
 * `qty` and `ideal` were never seeded, so every replenish item sat at the
 * column defaults — nought of a wanted one — and the cupboard the feature
 * exists for was a list of zeroes. The row draws "2/3" when you keep more than
 * one, so a demo without them is a demo of a checkbox.
 *
 * `bought` is stored and derived (`qty >= max(ideal, 1)`), so it is computed
 * here rather than taken. Callers that only say `bought: true` still get a
 * count that agrees with it, which is what they meant: one, and one is enough.
 */
const shoppingItem = (name, type, extra = {}) => {
	const existing = one('select id from inventory_items where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	const ideal = extra.ideal ?? 1;
	const qty = extra.qty ?? (extra.bought ? Math.max(ideal, 1) : 0);
	const bought = qty >= Math.max(ideal, 1);
	return run(
		`insert into inventory_items
		 (user_id, name, type, inventory_category_id, notes, qty, ideal_qty, bought, bought_at, snoozed,
		  attributes)
		 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		name,
		type,
		extra.categoryId ?? null,
		extra.notes ?? '',
		qty,
		ideal,
		bought ? 1 : 0,
		bought ? stamp(dayOffset(-2)) : null,
		extra.snoozed ? 1 : 0,
		/*
		 * Attributes, because a seeded instance is meant to show what the app
		 * does and an item with none shows a list of bare names. The cable
		 * drawer is the case the feature was asked for: a length, a material
		 * and a speed that can be filtered and compared rather than four
		 * labels that cannot.
		 */
		JSON.stringify(extra.attributes ?? {})
	);
};

const goalArea = (name, color, sortOrder) => {
	const existing = one('select id from goal_areas where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into goal_areas (user_id, name, color, sort_order) values (?, ?, ?, ?)',
		uid,
		name,
		color,
		sortOrder
	);
};

/**
 * A goal, and the measures under it.
 *
 * `measures` is a list, because a goal can want several things at once — the
 * dev account needs one of those or the row that draws three bars is a row
 * nobody ever sees.
 */
const goal = (title, horizon, periodStart, extra = {}) => {
	const existing = one('select id from goals where user_id = ? and title = ?', uid, title);
	if (existing) return existing.id;
	const id = run(
		`insert into goals
		 (user_id, area_id, parent_id, title, notes, horizon, period_start, status, outcome, closed_at)
		 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		extra.areaId ?? null,
		extra.parentId ?? null,
		title,
		extra.notes ?? '',
		horizon,
		periodStart,
		extra.status ?? 'open',
		extra.outcome ?? '',
		extra.status && extra.status !== 'open' ? stamp(dayOffset(-3)) : null
	);

	(extra.measures ?? []).forEach((m, at) => {
		// Counted or measured: books are counted, kilometres are not. Taken from
		// the numbers unless the measure says, so the dev database has one of
		// each and both halves of the goal card are on screen.
		const whole = m.whole ?? (Number.isInteger(m.target) && Number.isInteger(m.current ?? 0));
		run(
			'insert into goal_targets (user_id, goal_id, target_value, current_value, unit, whole, measure_activity, sort_order) values (?, ?, ?, ?, ?, ?, ?, ?)',
			uid,
			id,
			m.target,
			m.current ?? 0,
			m.unit ?? '',
			whole ? 1 : 0,
			// A measure counted from the workout register rather than typed in,
			// so the dev database has one of those on screen too.
			m.countedFrom ?? null,
			at
		);
	});
	return id;
};

const linkGoal = (goalId, { slotId = null, todoId = null, activityId = null }) => {
	const existing = one(
		'select id from goal_links where goal_id = ? and coalesce(slot_id, -1) = coalesce(?, -1) and coalesce(todo_id, -1) = coalesce(?, -1) and coalesce(activity_id, -1) = coalesce(?, -1)',
		goalId,
		slotId,
		todoId,
		activityId
	);
	if (existing) return existing.id;
	return run(
		'insert into goal_links (user_id, goal_id, slot_id, todo_id, activity_id) values (?, ?, ?, ?, ?)',
		uid,
		goalId,
		slotId,
		todoId,
		activityId
	);
};

const quote = (text, author) => {
	const existing = one('select id from quotes where user_id = ? and text = ?', uid, text);
	if (existing) return existing.id;
	return run('insert into quotes (user_id, text, author) values (?, ?, ?)', uid, text, author);
};

const win = (forDate, position, content) => {
	const existing = one(
		'select id from daily_wins where user_id = ? and for_date = ? and position = ?',
		uid,
		forDate,
		position
	);
	if (existing) return existing.id;
	return run(
		'insert into daily_wins (user_id, for_date, position, content) values (?, ?, ?, ?)',
		uid,
		forDate,
		position,
		content
	);
};

const scheme = (name, slots) => {
	const existing = one('select id from planning_schemes where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	const id = run('insert into planning_schemes (user_id, name) values (?, ?)', uid, name);
	for (const s of slots) {
		run(
			`insert into scheme_slots
			 (user_id, scheme_id, weekday, start_time, duration_minutes, mode, activity_id, label, active)
			 values (?, ?, ?, ?, ?, 'activity', ?, '', 1)`,
			uid,
			id,
			s.weekday,
			s.startTime,
			s.durationMinutes,
			s.activityId
		);
	}
	return id;
};

const instance = (slotId, scheduledAt, status, extra = {}) => {
	const existing = one(
		'select id from task_records where user_id = ? and slot_id is ? and scheduled_at = ?',
		uid,
		slotId,
		scheduledAt
	);
	if (existing) return existing.id;
	return run(
		`insert into task_records
		 (user_id, slot_id, exceptional_slot_id, scheduled_at, status, completed_at, notes, resolved_activity_id)
		 values (?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		slotId,
		extra.exceptionalSlotId ?? null,
		scheduledAt,
		status,
		extra.completedAt ?? null,
		extra.notes ?? '',
		extra.resolvedActivityId ?? null
	);
};

const apiToken = (name, scopes) => {
	const existing = one('select id from api_tokens where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	const plain = `onto_${randomBytes(24).toString('hex')}`;
	const hash = createHash('sha256').update(plain).digest('hex');
	// Kept in the clear for a calendar link and for nothing else — that is the
	// rule the app itself follows, and the settings page shows the address back.
	const keep = scopes === 'calendar:read' ? plain : null;
	const id = run(
		`insert into api_tokens (user_id, name, token_hash, plaintext, prefix, scopes, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		name,
		hash,
		keep,
		plain.slice(0, 12),
		scopes,
		stamp(now),
		stamp(now)
	);
	console.log(`  api token "${name}": ${plain}`);
	return id;
};

/**
 * `kind` and `display` must be values from the schema's own enums —
 * `measurement`/`event`/`counter`/`state` and `line_chart`/`bar_chart`/… —
 * because SQLite does not enforce them. Seeding `number` and `line` wrote rows
 * no renderer matched, so every stream fell back to a bare list of points and
 * the charts were never seen in development.
 */
const stream = (slug, name, kind, unit, display, retentionDays = null) => {
	const existing = one('select id from data_streams where user_id = ? and slug = ?', uid, slug);
	if (existing) return existing.id;
	return run(
		`insert into data_streams
		 (user_id, slug, name, source, kind, unit, display, config, show_on_dashboard, retention_days, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?, ?)`,
		uid,
		slug,
		name,
		slug.split('.')[0],
		kind,
		unit,
		display,
		retentionDays,
		stamp(now),
		stamp(now)
	);
};

const point = (streamId, at, localDate, value) => {
	if (one('select id from data_points where stream_id = ? and local_date = ?', streamId, localDate))
		return;
	run(
		`insert into data_points
		 (user_id, stream_id, external_id, at, local_date, value_num, meta, created_at)
		 values (?, ?, ?, ?, ?, ?, '{}', ?)`,
		uid,
		streamId,
		`${localDate}-seed`,
		at,
		localDate,
		value,
		stamp(now)
	);
};

const manifest = (source, name, description, metaKeys) => {
	const existing = one(
		'select id from plugin_manifests where user_id = ? and source = ?',
		uid,
		source
	);
	if (existing) return existing.id;
	return run(
		`insert into plugin_manifests
		 (user_id, source, name, description, homepage, meta_keys, updated_at)
		 values (?, ?, ?, ?, ?, ?, ?)`,
		uid,
		source,
		name,
		description,
		'https://example.invalid/scale',
		metaKeys,
		stamp(now)
	);
};

// --- the account itself ---------------------------------------------------------

setting('onboarding.done', 'true');
setting('user.timezone', 'America/Sao_Paulo');
setting('week.firstDay', '0');
setting('week.generateDay', '6');
setting('ui.theme', 'system');
// Everything shown: the dev account should have a little of everything, and a
// section hidden here would hide the very features being worked on.
setting('ui.hiddenSections', '[]');
setting(
	'dashboard.layout',
	'todayTasks,goals,habits,weekPlan,threeWins,diary,shopping,quickLinks,quote'
);

// --- the week -------------------------------------------------------------------

/*
 * Five areas, not three.
 *
 * Work, health and personal are the categories every new account starts with,
 * and a demo built out of only those draws a week in two colours. Learning and
 * home are the two most people add first — the language, the instrument, the
 * cooking and the errands were all sitting under "personal" pretending to be
 * the same thing — so the dev account has them, and the week has five colours
 * in it rather than two.
 */
const work = category('work', '#1d4ed8', '#dbeafe');
const health = category('health', '#0f766e', '#ccfbf1');
const personal = category('personal', '#b45309', '#fef3c7');
const learning = category('learning', '#7c3aed', '#ede9fe');
const home = category('home', '#be185d', '#fce7f3');

const deepWork = activity('deep work', work);
const meetings = activity('meetings', work);
const gym = activity('gym', health);
const stretching = activity('stretching', health);
const russian = activity('learn russian', learning);
const reading = activity('reading', learning);
const piano = activity('piano practice', personal);
const cooking = activity('cooking', home);

for (let weekday = 0; weekday < 5; weekday++) slot(weekday, '09:00', 180, deepWork);
slot(0, '14:00', 60, meetings);
slot(2, '14:00', 60, meetings);
slot(1, '18:00', 60, gym);
slot(3, '18:00', 60, gym);
slot(5, '10:00', 45, gym);
// Half an hour rather than a quarter: below about twenty minutes a block is
// too short to draw its own name, and the day opened on an anonymous stripe.
for (let weekday = 0; weekday < 7; weekday++) slot(weekday, '07:00', 30, stretching);
slot(2, '20:00', 45, russian);
slot(4, '20:00', 45, piano);
slot(6, '11:00', 90, cooking);
// Fortnightly, so the recurrence editor has something that is not plain weekly.
slot(4, '16:00', 60, meetings, 'weeks:2:' + monday);
// A block that names an area rather than a specific thing.
categorySlot(5, '15:00', 120, personal, 'errands');

/*
 * The parts of a day that are not the job.
 *
 * Three hours of deep work and a meeting was an honest weekday and a terrible
 * picture: the day view is the first screenshot in the store listing and it
 * opened on a column of identical blue rectangles. It is also the wrong
 * argument. An app that holds a whole life should not draw a calendar that
 * holds only somebody's employer.
 *
 * So every weekday now has a morning that starts with something read, a lunch
 * somebody actually cooks, and an afternoon that belongs to the person — and
 * the two weekend days have no work on them at all, which is the other half of
 * the same argument.
 */
for (let weekday = 0; weekday < 5; weekday++) {
	slot(weekday, '08:00', 45, reading);
	categorySlot(weekday, '12:15', 45, home, 'lunch');
}
slot(0, '16:30', 60, piano);
categorySlot(1, '16:00', 60, personal, 'errands');
slot(2, '15:30', 60, gym);
slot(2, '16:30', 45, piano);
categorySlot(3, '16:30', 90, personal, 'errands');
slot(4, '18:00', 60, gym);
slot(5, '17:00', 60, reading);
slot(6, '16:00', 60, reading);
slot(6, '18:30', 60, piano);

/*
 * Today's one thing that is not on every Wednesday.
 *
 * It used to be an activity block on `meetings` with "quarterly review" in the
 * label, which is not what a label is: a block is named by what it *is*, so the
 * grid drew a second rectangle saying "meetings" an hour after the first one
 * and the listing's opening screenshot was two identical blue blocks
 * overlapping. A one-off that names an area and says what it is draws its own
 * name.
 */
oneOffInCategory(today, '13:00', 60, work, 'quarterly review');
// And one the other way round: a one-off that *is* an activity, with notes on
// it. Both shapes exist in the app, so both shapes are in the dev database.
oneOff(iso(dayOffset(1)), '07:30', 45, gym, 'pool is shut — run instead');
// These two name an area rather than an activity. They used to be passed to
// oneOff, which writes the number into activity_id — and it only ever worked
// because a long-lived dev database happened to have an activity with the
// same id as the category. On a database seeded from scratch the foreign key
// caught it, which is what building the demo does every hour.
oneOffInCategory(iso(dayOffset(1)), '19:30', 120, personal, 'dinner with M');
oneOffInCategory(iso(dayOffset(-1)), '08:00', 60, health, 'physio');

// One occurrence of the Wednesday Russian block, dropped for a single week.
const russianSlot = one(
	'select id from recurring_tasks where user_id = ? and activity_id = ? limit 1',
	uid,
	russian
);
if (
	russianSlot &&
	!one(
		'select id from suppressed_slots where user_id = ? and slot_id = ? and date = ?',
		uid,
		russianSlot.id,
		iso(dayOffset(2))
	)
)
	run(
		'insert into suppressed_slots (user_id, date, slot_id) values (?, ?, ?)',
		uid,
		iso(dayOffset(2)),
		russianSlot.id
	);

// History to look at: last week done, this week partly.
const deepWorkSlot = one(
	'select id from recurring_tasks where user_id = ? and activity_id = ? limit 1',
	uid,
	deepWork
);
if (deepWorkSlot) {
	for (let back = 1; back <= 10; back++) {
		const d = dayOffset(-back);
		if (d.getDay() === 0 || d.getDay() === 6) continue;
		const at = `${iso(d)}T09:00:00`;
		const status = back % 4 === 0 ? 'skipped' : 'done';
		instance(deepWorkSlot.id, at, status, {
			completedAt: status === 'done' ? `${iso(d)}T12:0${back % 6}:00` : null,
			notes: back === 1 ? 'finished the migration' : ''
		});
	}
}

scheme('holiday week', [
	{ weekday: 0, startTime: '10:00', durationMinutes: 60, activityId: stretching },
	{ weekday: 2, startTime: '11:00', durationMinutes: 120, activityId: cooking },
	{ weekday: 4, startTime: '15:00', durationMinutes: 90, activityId: piano }
]);

// --- todos ----------------------------------------------------------------------

todo('call the dentist', {
	tags: ['health', 'phone'],
	urgency: 4,
	interest: 1,
	ease: 2,
	categoryId: personal,
	sortOrder: 1
});
todo('buy running shoes', {
	interest: 4,
	ease: 2,
	categoryId: health,
	sortOrder: 2,
	tags: ['shopping']
});
todo('renew the domain', {
	tags: ['a1', 'done'],
	urgency: 5,
	ease: 1,
	categoryId: work,
	scheduledDate: today,
	sortOrder: 3
});
todo('read the Litestream docs', {
	status: 'doing',
	categoryId: work,
	sortOrder: 4,
	tags: ['a1', 'reading']
});
todo('fix the bike light', { status: 'done', categoryId: personal, sortOrder: 5 });
todo('plan the trip', {
	notes: 'flights first, then somewhere to stay',
	interest: 5,
	sortOrder: 6
});

// --- goals ----------------------------------------------------------------------

const areaHealth = goalArea('health', '#0f766e', 0);
const areaCraft = goalArea('craft', '#1d4ed8', 1);

const yearGoal = goal('read twelve books', 'year', yearStart, {
	areaId: areaCraft,
	measures: [{ target: 12, current: 7, unit: 'books' }]
});
goal('run a half marathon', 'quarter', quarterStart, {
	areaId: areaHealth,
	parentId: null,
	notes: 'build up to 21km without walking',
	// A distance, measured rather than counted — 21.1 is the half marathon and
	// the point of the other kind of measure.
	measures: [{ target: 21.1, current: 14.6, unit: 'km', whole: false }]
});
/*
 * The case where the number is not typed at all.
 *
 * Every running session below records `ran` in km, and this adds them up
 * inside the quarter rather than asking somebody to keep the same total twice.
 * The goal card shows it as read-only, with the word it counts beside it.
 */
goal('run 100km this quarter', 'quarter', quarterStart, {
	areaId: areaHealth,
	notes: 'counted from the register, not typed in',
	measures: [{ target: 100, unit: 'km', whole: false, countedFrom: 'ran' }]
});

// The multi-measure case: one commitment, three numbers under it.
goal('get the band playing again', 'year', yearStart, {
	areaId: areaCraft,
	notes: 'rehearsals are cheap; the gigs are the hard part',
	measures: [
		{ target: 3, current: 1, unit: 'gigs' },
		{ target: 5, current: 4, unit: 'songs recorded' },
		{ target: 40, current: 12, unit: 'rehearsal hours' }
	]
});
const monthGoal = goal('gym twice a week', 'month', monthStart, { areaId: areaHealth });
goal('ship the plugin API', 'quarter', quarterStart, {
	areaId: areaCraft,
	status: 'achieved',
	outcome: 'shipped, with docs'
});
goal('learn to sail', 'year', yearStart, { status: 'abandoned', outcome: 'no time this year' });

const gymSlot = one(
	'select id from recurring_tasks where user_id = ? and activity_id = ? limit 1',
	uid,
	gym
);
if (gymSlot) linkGoal(monthGoal, { slotId: gymSlot.id });
linkGoal(yearGoal, { activityId: russian });

/*
 * A week counted from its to-dos, part done — the commonest goal there is,
 * and the one whose card carries a count, a bar and the fold of tasks.
 */
const weekGoal = goal('clear the paperwork pile', 'week', monday, {
	areaId: areaCraft,
	parentId: yearGoal
});
[
	['file the tax receipts', 'done'],
	['renew the passport', 'done'],
	['cancel the old phone plan', 'done'],
	['scan the lease', 'done'],
	['reply to the bank letter', 'todo'],
	['book the car inspection', 'todo']
].forEach(([title, status], at) =>
	linkGoal(weekGoal, { todoId: todo(title, { status, sortOrder: 20 + at }) })
);

// --- diary, ideas ----------------------------------------------------------------

diary(
	1,
	'Started using the planner properly. Blocked out the mornings for deep work.',
	['planning', 'work'],
	null,
	// Pinned, so a seeded notebook shows that one note can be kept above the rest.
	{ pinned: true }
);
diary(2, 'Gym twice this week with João. The evening slot works better than mornings.', ['health']);
diary(
	3,
	'**Three wins**\n\n1. shipped the export\n2. ran 8km\n3. cooked instead of ordering',
	['3w'],
	iso(dayOffset(-1))
);
diary(4, 'Reading is slipping. Move it before the phone, not after.', ['reading', 'planning']);

// --- people ------------------------------------------------------------------

const ana = person('Ana', 'partner', 'anniversary in March', {
	birthday: '1992-03-14',
	phone: '+55 21 90000-0001',
	email: 'ana@example.test'
});
// A birthday whose year nobody knows — the ordinary case in an address book,
// and the one a plain date field cannot hold.
const joao = person('João', 'friend', 'the one who runs', { birthday: '--07-02' });
const marco = person('Marco', 'professional', 'runs the Tuesday standup', {
	phone: '+55 11 90000-0002',
	email: 'marco@example.test'
});
const mum = person('Mum', 'family');

mention(1, ana);
mention(2, joao);
mention(4, marco);

/*
 * A person is worth opening when there is something under their name.
 *
 * One mention each made every page in this section read as an empty right-hand
 * panel with a face above it — true to the data model and a poor picture of
 * what the page is for, which is remembering what you and somebody have
 * actually been doing. So the people who recur, recur.
 */
diary(
	13,
	'Ana wants the last two days of the trip left loose. She is right.',
	['travel'],
	iso(dayOffset(-3))
);
diary(
	14,
	'Ana’s birthday is in March — the location by the water takes bookings a season out.',
	['family'],
	iso(dayOffset(-11))
);
diary(
	15,
	'Ana finished the Le Guin before me and has said nothing about the ending.',
	['reading'],
	iso(dayOffset(-19))
);
diary(
	16,
	'Marco moved the standup to Tuesdays for good, so the morning block survives.',
	['work'],
	iso(dayOffset(-6))
);
diary(
	17,
	'João is running the half in October and wants company on the long ones.',
	['health'],
	iso(dayOffset(-8))
);

mention(13, ana);
mention(14, ana);
mention(15, ana);
mention(16, marco);
mention(17, joao);

diary(5, 'The plumber says the wall can go, but not before the pipes move.', ['home']);
diary(6, 'Finished The Dispossessed. The two timelines land better than I expected.', ['reading']);
diary(7, 'Booked the flights. Three days in Lisbon, then the train south.', ['travel']);
diary(8, 'The leak is fixed. Two weeks and a new bit of ceiling.', ['home']);

// --- notebooks ---------------------------------------------------------------

const kitchen = notebook(
	'Kitchen renovation',
	'Quotes, measurements, and whatever the plumber said last.\n' +
		'The kitchen is 3.4 by 2.8 metres; the old cabinets come out in the first week, ' +
		'and the plumber has to be booked before the tiler.\n' +
		'Budget is whatever is left after the boiler. The three shops worth visiting are in the notes.'
);
const readingNotebook = notebook('Reading', 'What I am reading, and what I thought of it.');
const portugal = notebook('Portugal in September', 'Everything for the trip.');
const leak = notebook('Bathroom leak', 'Two weeks of it. Kept for the invoices.', true);

/**
 * The notebook that shows what a notebook is for.
 *
 * The others hold a line or two each, which demonstrates the field and not the
 * feature. Somebody reading a long book over months is the case notebooks
 * exist for, and it has to have enough in it to be worth opening. Plato,
 * because it is public domain and because arguing with a book is exactly the
 * kind of thing people keep notes about.
 */
const republic = notebook(
	'The Republic',
	'Reading it properly this time, a book at a time. Notes as I go.'
);

todo('get three quotes for the counter', { urgency: 3, interest: 2, sortOrder: 7 });
todo('measure the wall properly', { status: 'done', sortOrder: 8 });

inNotebook('todo_tasks', 'title', 'get three quotes for the counter', kitchen);
inNotebook('todo_tasks', 'title', 'measure the wall properly', kitchen);
inNotebook('todo_tasks', 'title', 'plan the trip', portugal);
inNotebook('diary_entries', 'seq', 5, kitchen);
inNotebook('diary_entries', 'seq', 4, readingNotebook);
inNotebook('diary_entries', 'seq', 6, readingNotebook);
inNotebook('diary_entries', 'seq', 7, portugal);
inNotebook('diary_entries', 'seq', 8, leak);
inNotebook('goals', 'title', 'read twelve books', readingNotebook);

/*
 * Two notebooks with a year in them, and two with a page.
 *
 * A demo of notebooks that holds four lines is a demo of the field rather than
 * of the feature: the fold, the tag filter, the counts on the tabs, the task
 * list that scrolls, the note somebody pinned to the top — none of them show
 * anything on a notebook with three notes in it. So the renovation and the
 * trip carry what a subject actually accumulates over months, and Reading and
 * The Republic stay short, which is the other true shape and the one a new
 * notebook has.
 *
 * Ratings on the tasks throughout: the to-do room sorts by them, and a list
 * where nobody answered draws three half-height bars on every row.
 */
const KITCHEN_NOTES = [
	['The tiler wants the wall re-skimmed first. That is another week.', ['home', 'plumbing']],
	['Three quotes in. The middle one can start in April; the cheap one cannot say when.', ['money']],
	['Measured again: 3.42 by 2.79. The old drawing was out by four centimetres.', ['home']],
	['The boiler is staying. Moving it is two thousand on its own and it works.', ['money']],
	['Tiles: the matt ones mark, the gloss ones show every fingerprint. Ask about satin.', ['home']],
	[
		'Worktop shops worth visiting are the two on Bridge Street. The third is a showroom for one brand.',
		['home']
	],
	[
		'Quartz against oak: quartz wins on the sink side, oak everywhere else. Ugly, but honest.',
		['home']
	],
	['Electrician wants the layout final before he books. Fair enough.', ['plumbing']],
	['The window is coming out after all — the frame is gone at the bottom corner.', ['home']],
	['Skip booked for the 14th. Two weeks, which the plumber says is optimistic.', ['home']],
	[
		'Paint: the sample looks grey in the morning and green after four. Living with it a week.',
		['home']
	],
	[
		'Cabinet doors are the cheapest way to change our minds later, so the carcasses go plain.',
		['money']
	],
	[
		'Note for the tiler: the wall is not square by about a centimetre over two metres.',
		['plumbing']
	],
	['Handles are the thing everyone touches and the last thing anyone budgets for.', ['home']],
	['The old cooker goes to Marco. He is collecting on Saturday.', ['home']],
	['Floor has to go in before the units or the dishwasher cannot come out again.', ['home']],
	['Asked about the extractor: recirculating is half the work and none of the point.', ['home']],
	['Running total is over by about eight hundred, most of it the window.', ['money']],
	['Lights: one on the ceiling is what we have now and it is why nobody cooks here.', ['home']],
	['Two weeks without a kitchen is the part nobody plans. Microwave on the landing.', ['home']],
	['Finished list of what is left, for the last week — see the tasks.', ['home']]
];

/** `[title, done, urgency, interest, ease, tags]`. */
const KITCHEN_TASKS = [
	['book the plumber for the first week', true, 5, 2, 3, ['plumbing']],
	['get three quotes for the counter', false, 3, 2, 2, ['money']],
	['measure the wall properly', true, 4, 1, 4, ['home']],
	['order the skip', true, 5, 1, 5, ['home']],
	['empty the top cupboards', true, 3, 1, 4, ['home']],
	['take the old cooker out', true, 4, 2, 2, ['home']],
	['strip the tiles off the splashback wall', true, 4, 2, 2, ['home']],
	['cap the old feed before the units go', true, 5, 1, 2, ['plumbing']],
	['choose the worktop', false, 4, 4, 2, ['home']],
	['choose the tiles', false, 3, 4, 3, ['home']],
	['get the electrician to quote the sockets', true, 4, 2, 3, ['plumbing']],
	['decide where the fridge goes', true, 3, 3, 4, ['home']],
	['confirm the window measurements with the fitter', true, 5, 1, 3, ['home']],
	['pay the deposit on the units', true, 5, 1, 5, ['money']],
	['chase the delivery date', false, 4, 1, 4, ['money']],
	['clear the hall for the delivery', false, 3, 1, 5, ['home']],
	['sand and fill the ceiling before painting', true, 2, 1, 2, ['home']],
	['paint the ceiling', true, 2, 2, 3, ['home']],
	['live with the paint sample for a week', true, 1, 3, 5, ['home']],
	['book the tiler for after the plumber', false, 4, 2, 3, ['plumbing']],
	['order the handles', false, 2, 4, 5, ['home']],
	['sort out a temporary sink', true, 4, 1, 3, ['home']],
	['move the microwave to the landing', true, 2, 1, 5, ['home']],
	['take the old units to the tip', true, 3, 1, 2, ['home']],
	['seal round the new window', false, 3, 1, 3, ['home']],
	['fit the extractor', false, 3, 3, 2, ['plumbing']],
	['put the doors on', false, 3, 5, 3, ['home']],
	['touch up the skirting', false, 1, 1, 4, ['home']],
	['get the final invoice from the plumber', true, 4, 1, 4, ['money']],
	['photograph everything for the insurance', true, 2, 2, 4, ['home']],
	['send Marco the cooker collection time', true, 3, 2, 5, ['home']]
];

const PORTUGAL_NOTES = [
	['Nine days, Lisbon in and Porto out. The train between them is three hours.', ['travel']],
	['Flights are cheapest on the Tuesday either side. Worth the two days off.', ['travel', 'money']],
	['September is still warm and the queues are gone. Everybody says the same thing.', ['travel']],
	['Alfama is the one to stay in for the first half. Steep, though.', ['travel']],
	['Booked the Lisbon flat: two nights, kitchen, no lift, fourth floor.', ['travel']],
	['Porto: staying near São Bento so the station is a walk.', ['travel']],
	['The tram everyone photographs is the 28 and it is full by nine.', ['travel']],
	['Ana says go to Sintra on a weekday and start at the top of the hill.', ['travel', 'family']],
	['Tiles: the museum is in a convent out past the river and worth the trip.', ['travel']],
	[
		'Food notes: bacalhau done twelve ways, and the pastries are a different thing there.',
		['food']
	],
	[
		'Booked the place in the Douro for two nights. It is the middle of nowhere, on purpose.',
		['travel']
	],
	['Car for the Douro leg only. Driving in either city is a bad idea.', ['travel', 'money']],
	['Money: cards everywhere, but the markets are cash and the good ones are markets.', ['money']],
	['Adapter is the same as France. Not the same as here.', ['travel']],
	['Walking shoes. Everything in Lisbon is a hill and the pavement is polished stone.', ['travel']],
	['Sunset from the miradouro above the cathedral, if we can get a seat.', ['travel']],
	['Bought the train tickets — reserved seats, which apparently matter in September.', ['travel']],
	['Rough budget is nine hundred each, flights in. Food is cheap, the wine is not.', ['money']],
	['Day in Coimbra on the way north if the train times work.', ['travel']],
	['List of what is left to book, in the tasks.', ['travel']],
	['Ask Mum whether Dad still has the phrasebook from 1994.', ['family']]
];

const PORTUGAL_TASKS = [
	['book the flights', true, 5, 5, 4, ['travel', 'money']],
	['book the Lisbon flat', true, 5, 4, 3, ['travel']],
	['book the Porto flat', true, 4, 4, 3, ['travel']],
	['book the Douro place', true, 4, 5, 3, ['travel']],
	['buy the train tickets', true, 4, 3, 4, ['travel']],
	['hire the car for the Douro leg', true, 3, 2, 3, ['travel']],
	['check the passports are in date', true, 5, 1, 5, ['travel']],
	['tell the bank we are going', true, 3, 1, 5, ['money']],
	['sort travel insurance', true, 4, 1, 4, ['money']],
	['ask Ana about Sintra', true, 2, 4, 5, ['family']],
	['find somewhere for the first night dinner', false, 3, 5, 3, ['food']],
	['book Sintra tickets for a weekday', false, 4, 4, 3, ['travel']],
	['work out the Coimbra train times', true, 2, 3, 2, ['travel']],
	['pack the adapter', false, 2, 1, 5, ['travel']],
	['break in the walking shoes', false, 3, 2, 4, ['travel']],
	['get euros for the markets', false, 3, 1, 4, ['money']],
	['download the maps for offline', false, 2, 2, 5, ['travel']],
	['ask Mum about the phrasebook', false, 1, 3, 5, ['family']],
	['stop the post', true, 3, 1, 4, ['home']],
	['ask Marco to water the plants', true, 3, 2, 5, ['family']],
	['set the heating to away', false, 2, 1, 5, ['home']],
	['charge the camera battery', false, 2, 2, 5, ['travel']],
	['print the booking confirmations', true, 2, 1, 5, ['travel']],
	['check the flat has a kettle', true, 1, 2, 5, ['travel']],
	['make the list of tile places', true, 2, 4, 4, ['travel']],
	['book the tile museum for the Saturday', false, 3, 4, 3, ['travel']],
	['find out what is open on the Sunday', false, 3, 3, 2, ['travel']],
	['write down the emergency numbers', true, 3, 1, 5, ['travel']],
	['put the itinerary somewhere we can both see it', true, 4, 3, 4, ['travel']],
	['leave a key with Ana', true, 4, 1, 5, ['family']],
	['decide whether the Douro is two nights or three', true, 3, 4, 3, ['travel']]
];

const fill = (notebookId, notes, tasks) => {
	for (const [content, labels] of notes) notebookNote(notebookId, content, labels);
	tasks.forEach(([title, done, urgency, interest, ease, labels], at) =>
		notebookTodo(notebookId, title, {
			status: done ? 'done' : 'todo',
			urgency,
			interest,
			ease,
			tags: labels,
			sortOrder: 100 + at
		})
	);
	renumber(notebookId);
};

fill(kitchen, KITCHEN_NOTES, KITCHEN_TASKS);
fill(portugal, PORTUGAL_NOTES, PORTUGAL_TASKS);

orphanNote('The old flat: the landlord kept the deposit over the scuffed floor.');

// The ideas somebody who USES a planner writes down — not ideas about
// building one. The demo is a person's account, and an account full of
// product notes about the app it is running in reads as the author's
// scratchpad, which is exactly what a visitor should not be looking at.
idea('Learn to make proper bread — the slow kind, not the machine', ['someday'], {
	favorite: true
});
idea('A weekend with no plans in it at all, once a month', ['living'], {
	applied: true,
	appliedNote: 'blocked out the first Saturday'
});
idea('Ask Mum for the recipe before it is only in her head', ['family']);
idea('Cycle to work through the park instead of the main road', ['health'], { favorite: true });

// --- habits -----------------------------------------------------------------------

const water = habit('drink water', 'good', '0,1,2,3,4,5,6', 'two litres');
const readBeforeBed = habit('read before bed', 'good', '0,1,2,3,4', '20 minutes, paper only');
const doomscroll = habit('doomscrolling', 'bad', '', 'phone in the other room after 22:00');
const coffee = habit('coffee', 'neutral', '');

for (let back = 0; back < 40; back++) {
	const d = iso(dayOffset(-back));
	if (back % 7 !== 3) logHabit(water, d);
	if (back % 3 !== 0) logHabit(readBeforeBed, d, back === 1 ? 'finished the Le Guin' : '');
	if (back % 2 === 0) logHabit(coffee, d);
}
logHabit(doomscroll, iso(dayOffset(-9)), 'an hour before bed, again');

// --- shopping ---------------------------------------------------------------------

const pantry = shoppingCategory('pantry', 0);
const fresh = shoppingCategory('fresh', 1);
const household = shoppingCategory('household', 2);

/*
 * A cupboard, not a tick list.
 *
 * Each of these says what is there and what is kept, because that pair is the
 * whole difference between this and a shopping list: two tins of tomatoes and
 * none are both "unticked" the moment you open the last one. Dish soap is two
 * of a kept three — enough to be fine today and on the list anyway — which is
 * the case the "Short" filter exists for and the one worth a picture.
 */
shoppingItem('coffee beans', 'replenish', {
	categoryId: pantry,
	notes: 'the dark roast',
	qty: 1,
	ideal: 2,
	attributes: { brand: 'Emberdal', roast: 'dark', weight: '500g', origin: 'Halvern Ridge' }
});
shoppingItem('olive oil', 'replenish', {
	categoryId: pantry,
	qty: 0,
	ideal: 1,
	attributes: { brand: 'Stonegrove', weight: '500ml', origin: 'Verrin Coast' }
});
shoppingItem('rice', 'replenish', {
	categoryId: pantry,
	qty: 2,
	ideal: 2,
	attributes: { brand: 'Harvestone', weight: '1kg', variety: 'parboiled' }
});
shoppingItem('milk', 'replenish', {
	categoryId: fresh,
	qty: 0,
	ideal: 2,
	attributes: { brand: 'Meadowline', weight: '1L', variety: 'semi-skimmed' }
});
shoppingItem('eggs', 'replenish', {
	categoryId: fresh,
	qty: 6,
	ideal: 6,
	attributes: { variety: 'free range', size: 'large' }
});
shoppingItem('tomatoes', 'replenish', {
	categoryId: fresh,
	qty: 1,
	ideal: 4,
	attributes: { variety: 'plum', weight: '1kg' }
});
shoppingItem('dish soap', 'replenish', {
	categoryId: household,
	qty: 2,
	ideal: 3,
	attributes: { brand: 'Brightwell', weight: '500ml', scent: 'neutral' }
});
shoppingItem('lightbulbs', 'replenish', {
	categoryId: household,
	snoozed: true,
	qty: 0,
	ideal: 2,
	attributes: { fitting: 'E27', power: '9W', colour: 'warm white', brand: 'Halovex' }
});
shoppingItem('a proper desk chair', 'someday', {
	notes: 'try one before buying',
	attributes: { budget: '1200', material: 'mesh', colour: 'grey' }
});
shoppingItem('noise-cancelling headphones', 'someday', {
	attributes: { budget: '1800', brand: 'Quietvale', colour: 'black' }
});
shoppingItem('cast iron pan', 'someday', {
	bought: true,
	attributes: { material: 'cast iron', size: '26cm', brand: 'Ironcrest' }
});

/*
 * A drawer of cables, which is the case attributes were asked for.
 *
 * The same key reused across several items is the whole point — three things
 * with a `length`, two with a `material` — because that is what turns "every
 * 2m cable" into a question the list can answer rather than four labels that
 * cannot be compared.
 *
 * Lower case, like every other attribute this file writes. The app completes
 * a key from the ones already used, and `Length` beside `length` is exactly
 * the drift that completion exists to stop — a seeded instance that shows
 * both teaches the wrong habit on the first screen somebody opens.
 */
const drawer = shoppingCategory('the drawer', 4);
shoppingItem('USB-C to USB-C cable', 'keep', {
	categoryId: drawer,
	qty: 3,
	attributes: {
		plug: 'USB-C',
		length: '2m',
		speed: '480Mbps',
		colour: 'white',
		material: 'silicone'
	}
});
shoppingItem('USB-A to USB-C cable', 'keep', {
	categoryId: drawer,
	qty: 2,
	attributes: { plug: 'USB-A to USB-C', length: '1m', speed: '480Mbps', colour: 'black' }
});
shoppingItem('extension lead', 'keep', {
	categoryId: drawer,
	qty: 1,
	attributes: { length: '5m', colour: 'white', sockets: '4', material: 'rubber' }
});

// --- bills (finance) --------------------------------------------------------------
//
// A handful of monthly bills, one of them archived, and a couple of months of
// payments where the paid amount drifts from the expected — the gap the
// finance section is built to show.

const bill = (name, amountExpected, extra = {}) => {
	const existing = one('select id from bills where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into bills (user_id, name, amount_expected, currency, due_day, pay_lead_days, rhythm, active) values (?, ?, ?, ?, ?, ?, ?, ?)',
		uid,
		name,
		amountExpected,
		extra.currency ?? 'USD',
		extra.dueDay ?? null,
		extra.payLeadDays ?? 0,
		extra.rhythm ?? 'monthly',
		extra.active === false ? 0 : 1
	);
};

const billPaid = (billId, period, amountExpected, amountPaid) => {
	if (one('select id from bill_payments where bill_id = ? and period = ?', billId, period)) return;
	run(
		"insert into bill_payments (user_id, bill_id, period, amount_expected, amount_paid, currency, paid_at) values (?, ?, ?, ?, ?, ?, datetime('now'))",
		uid,
		billId,
		period,
		amountExpected,
		amountPaid,
		'USD'
	);
};

const billRent = bill('Rent', 180000, { dueDay: 5, payLeadDays: 2 });
const billPower = bill('Power', 15000, { dueDay: 12, payLeadDays: 3 });
const billWater = bill('Water', 8000, { dueDay: 12 });
const billInternet = bill('Internet', 9990, { dueDay: 20 });
const cleaner = bill('Cleaner', 12000, { rhythm: 'weekly' });
// The ones that make this somebody's life rather than a specimen: a box of
// vegetables from a smallholding, the climbing gym, the five-a-side, and the
// standing donation to the app itself.
bill('Farm box', 22000, { dueDay: 6 });
bill('Climbing gym', 14000, { dueDay: 8 });
bill('Five-a-side', 6000, { dueDay: 11 });
bill('Ontoplano', 5000, { dueDay: 3 });
bill('Old gym membership', 12900, { active: false });

// Last month, all paid; power ran a little high.
billPaid(billRent, '2026-08', 180000, 180000);
billPaid(billPower, '2026-08', 15000, 16240);
billPaid(billWater, '2026-08', 8000, 7650);
billPaid(billInternet, '2026-08', 9990, 9990);
// A couple of recent weeks of the cleaner.
billPaid(cleaner, '2026-W35', 12000, 12000);
billPaid(cleaner, '2026-W36', 12000, 13000);
// This month, some paid so far.
billPaid(billRent, '2026-09', 180000, 180000);
billPaid(billPower, '2026-09', 15000, 15880);

// --- income, statements and rules (finance) ---------------------------------------
//
// Income mirrors bills with its flow named; a couple of months of statement
// lines make the Net plots and the sorting rules worth looking at.

const income = (name, amountExpected, extra = {}) => {
	const existing = one(
		"select id from bills where user_id = ? and name = ? and flow = 'in'",
		uid,
		name
	);
	if (existing) return existing.id;
	return run(
		"insert into bills (user_id, name, amount_expected, currency, due_day, rhythm, flow) values (?, ?, ?, ?, ?, ?, 'in')",
		uid,
		name,
		amountExpected,
		extra.currency ?? 'USD',
		extra.dueDay ?? null,
		extra.rhythm ?? 'monthly'
	);
};

const salary = income('Salary', 850000, { dueDay: 5 });
const freelance = income('Freelance retainer', 200000, { dueDay: 15 });
billPaid(salary, '2026-08', 850000, 850000);
billPaid(freelance, '2026-08', 200000, 180000);
billPaid(salary, '2026-09', 850000, 850000);

const ledger = (name, kind, defaultParser) => {
	const existing = one('select id from ledgers where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into ledgers (user_id, name, kind, default_parser, sort_order) values (?, ?, ?, ?, (select count(*) from ledgers where user_id = ?))',
		uid,
		name,
		kind,
		defaultParser,
		uid
	);
};

const account = ledger('Current account', 'bank', 'csv:columns');
const creditCard = ledger('Credit card', 'card', 'csv:columns');

/*
 * The movements.
 *
 * Written as rows rather than as CSV text put through the parsers, because
 * this file is rsynced to the staging box on its own and has to run with
 * nothing but better-sqlite3 — importing the app's parsers would break the
 * hourly reset. Both ledgers are seeded against the generic column parser, so
 * nothing here is tied to one bank's export; the written parsers are exercised
 * against real export shapes in `tests/finance-statements.test.ts`, which is
 * where that fidelity belongs.
 *
 * Both signs as the app stores them: negative left the account, and a card
 * charge is money leaving whichever sign the export wrote it with.
 */
const movement = (ledgerId, occurredOn, amountCents, description, n = 1) => {
	const fingerprint = `${ledgerId}|seed:${occurredOn}:${amountCents}:${description}:${n}`;
	if (
		one(
			'select id from finance_transactions where user_id = ? and fingerprint = ?',
			uid,
			fingerprint
		)
	)
		return;
	run(
		'insert into finance_transactions (user_id, ledger_id, occurred_on, amount_cents, description, source, fingerprint) values (?, ?, ?, ?, ?, ?, ?)',
		uid,
		ledgerId,
		occurredOn,
		amountCents,
		description,
		'csv:columns',
		fingerprint
	);
};

// The account, as a `date,amount,id,description` export reads it.
//
// Three months of a life rather than three lines repeated: the salary and the
// bills do come back every month, which is the point of a ledger, but a
// statement that is only those reads as a placeholder and tests nothing — no
// rule matches more than one thing, the charts have one shape, and the search
// box has nothing to find. So the recurring ones recur and everything else is
// what a month actually has in it. The two December/January lines are there so
// the list crosses a year and shows the band that says which one.
movement(account, '2025-12-28', -9000, 'Corner Tap Bar');
movement(account, '2026-01-01', -4250, 'Northgate Pharmacy');

// July
movement(account, '2026-07-02', 850000, 'Transfer received - Arclight Systems - payroll');
movement(account, '2026-07-03', -5000, 'Transfer sent - Ontoplano - monthly support');
movement(account, '2026-07-05', -180000, 'Bill payment - Rent, Vista Lettings');
movement(account, '2026-07-06', -22000, 'Direct debit - Hollowbrook Farm - weekly box');
movement(account, '2026-07-07', -13500, 'Direct debit - Clearwater Utilities');
movement(account, '2026-07-08', -14000, 'Direct debit - Summit Indoor Climbing');
movement(account, '2026-07-09', -9990, 'Direct debit - Brightline Fibre');
movement(account, '2026-07-10', -45900, 'Bill payment - Meridian Health Cover');
movement(account, '2026-07-11', -6000, 'Transfer sent - Thursday Five-a-side - monthly dues');
movement(account, '2026-07-12', -15990, 'Bill payment - Ridgeline Ease');
movement(account, '2026-07-14', -21000, 'Debit card purchase - Milepost Fuel');
movement(account, '2026-07-16', -38400, 'Bill payment - Northwood Timber - cedar boards');
movement(account, '2026-07-17', 32000, 'Purchase refund - Halden Goods');
movement(account, '2026-07-19', -9700, 'Debit card purchase - Rootwork Florist');
movement(account, '2026-07-21', -8000, 'Cash withdrawal - ATM Terminal 4412');
movement(
	account,
	'2026-07-24',
	-25000,
	'Transfer sent - Cleo Hartman - •••.447.201-•• - NORTHBAY TRUST (0999) Branch: 3712 Account: 04418-2'
);
movement(account, '2026-07-28', -300000, 'Savings deposit - Fixed income note 2029');
movement(account, '2026-07-30', -18900, 'Bill payment - Miller Lane Veterinary - annual vaccines');

// August
movement(account, '2026-08-03', -5000, 'Transfer sent - Ontoplano - monthly support');
movement(account, '2026-08-05', 850000, 'Transfer received - Arclight Systems - payroll');
movement(account, '2026-08-05', -180000, 'Bill payment - Rent, Vista Lettings');
movement(account, '2026-08-06', -22000, 'Direct debit - Hollowbrook Farm - weekly box');
movement(account, '2026-08-07', -14120, 'Direct debit - Clearwater Utilities');
movement(account, '2026-08-08', -14000, 'Direct debit - Summit Indoor Climbing');
movement(account, '2026-08-09', -9990, 'Direct debit - Brightline Fibre');
movement(account, '2026-08-10', -45900, 'Bill payment - Meridian Health Cover');
movement(account, '2026-08-11', -6000, 'Transfer sent - Thursday Five-a-side - monthly dues');
movement(account, '2026-08-12', -16240, 'Bill payment - Ridgeline Ease');
movement(account, '2026-08-13', 45000, 'Transfer received - Marcus Reid');
movement(account, '2026-08-15', -27300, 'Debit card purchase - Ironway Tools & Metalwork');
movement(
	account,
	'2026-08-18',
	-120000,
	'Transfer sent - J. Kovac - •••.821.910-•• - ORION PAYMENTS (0998) Branch: 1 Account: 89023719-0'
);
movement(account, '2026-08-20', -18700, 'Debit card purchase - Milepost Fuel');
movement(account, '2026-08-22', -64300, 'Bill payment - Vehicle tax 2026 instalment 3/3');
movement(account, '2026-08-26', -11200, 'Debit card purchase - Paws & Whiskers Pet Shop');
movement(account, '2026-08-29', -300000, 'Savings deposit - Fixed income note 2029');

// September
movement(account, '2026-09-03', -5000, 'Transfer sent - Ontoplano - monthly support');
movement(account, '2026-09-05', 850000, 'Transfer received - Arclight Systems - payroll');
movement(account, '2026-09-05', -180000, 'Bill payment - Rent, Vista Lettings');
movement(account, '2026-09-06', -22000, 'Direct debit - Hollowbrook Farm - weekly box');
movement(account, '2026-09-07', -12880, 'Direct debit - Clearwater Utilities');
movement(account, '2026-09-08', -14000, 'Direct debit - Summit Indoor Climbing');
movement(account, '2026-09-09', -15880, 'Bill payment - Ridgeline Ease');
movement(account, '2026-09-09', -9990, 'Direct debit - Brightline Fibre');
movement(account, '2026-09-10', -45900, 'Bill payment - Meridian Health Cover');
movement(account, '2026-09-11', 120000, 'Transfer received - Tax refund');
movement(account, '2026-09-11', -6000, 'Transfer sent - Thursday Five-a-side - monthly dues');
movement(account, '2026-09-12', -7600, 'Debit card purchase - Riverside Farmers Market');

// And the card, as `date,title,amount` reads it — charges, so all outgoing.
// The same shape of variety, and for the same reason: a card statement where
// every line is the supermarket is a card statement nobody has.
movement(creditCard, '2026-07-04', -8600, 'The Potting Shed - seedlings and compost');
movement(creditCard, '2026-07-08', -19900, 'Fairmount Supermarket');
movement(creditCard, '2026-07-11', -3990, 'Sonora Streaming');
movement(creditCard, '2026-07-13', -5590, 'Reelbox.tv');
movement(creditCard, '2026-07-15', -7400, 'Starling Bakery');
movement(creditCard, '2026-07-17', -16800, 'Alder Street Butcher - farm cut');
movement(creditCard, '2026-07-18', -8900, 'Ride *Wayfare');
movement(creditCard, '2026-07-19', -13400, 'Daybreak Chemist');
movement(creditCard, '2026-07-20', -24900, 'Keenedge Tools - chisel and gouge');
movement(creditCard, '2026-07-22', -9800, 'Summit Indoor Climbing - shoes');
movement(creditCard, '2026-07-25', -4780, 'Delivery *Copper Pot Bistro');
movement(creditCard, '2026-07-27', -29900, 'Kestrel Online Store');
movement(creditCard, '2026-08-02', -13900, 'Pet Center - litter and food for both');
movement(creditCard, '2026-08-06', -18740, 'Fairmount Supermarket');
movement(creditCard, '2026-08-09', -4200, 'Corner Greengrocer');
movement(creditCard, '2026-08-11', -3990, 'Sonora Streaming');
movement(creditCard, '2026-08-12', -6700, 'The Potting Shed - basil seeds');
movement(creditCard, '2026-08-13', -5590, 'Reelbox.tv');
movement(creditCard, '2026-08-14', -1000, 'Homeware - odds and ends');
movement(creditCard, '2026-08-16', -11250, 'Palace Cinema');
movement(creditCard, '2026-08-17', -21900, 'Bootroom Sports - football boots');
movement(creditCard, '2026-08-19', -2390, 'Subscription *Nimbus');
movement(creditCard, '2026-08-19', -2390, 'Subscription *Nimbus', 2);
movement(creditCard, '2026-08-21', -9800, 'Delivery *Harbour Sushi');
movement(creditCard, '2026-08-23', -5400, 'Summit Indoor Climbing - chalk');
movement(creditCard, '2026-08-27', -15600, 'Everyday Clothing');
movement(creditCard, '2026-09-02', -8300, 'Ride *Wayfare');
movement(creditCard, '2026-09-04', -12400, 'Northwood Timber - sandpaper and varnish');
movement(creditCard, '2026-09-06', -21300, 'Fairmount Supermarket');
movement(creditCard, '2026-09-07', -13900, 'Pet Center - litter and food for both');
movement(creditCard, '2026-09-08', -5100, 'Corner Greengrocer');
movement(creditCard, '2026-09-09', -17600, 'Alder Street Butcher - farm cut');
movement(creditCard, '2026-09-11', -3990, 'Sonora Streaming');

const sortRule = (kind, name, pattern, position, color) => {
	if (
		one('select id from finance_rules where user_id = ? and kind = ? and name = ?', uid, kind, name)
	)
		return;
	run(
		'insert into finance_rules (user_id, kind, name, pattern, position, color) values (?, ?, ?, ?, ?, ?)',
		uid,
		kind,
		name,
		pattern,
		position,
		color
	);
};

// Order matters: the first rule that matches wins, so the specific ones sit
// above the general. `bill payment` used to be the whole of Utilities, which
// put the health cover and the rent under it — most bills arrive as a bill
// payment, and a rule that matches the envelope rather than the thing inside
// it is the mistake this seed should be demonstrating the fix for.
//
// Farm food sits above Groceries for the same reason. Somebody who buys a box
// from a smallholding every week and meat from one butcher wants to see that
// as its own line rather than folded into the supermarket — which is the whole
// argument for rules you write yourself, and it only shows if the seed has a
// life in it specific enough to need them.
sortRule('category', 'Ontoplano', 'ontoplano', 0, '#4338ca');
sortRule('category', 'Rent', 'rent', 1, '#7c2d12');
sortRule('category', 'Cats', 'veterinary|pet shop|pet center', 2, '#a16207');
sortRule('category', 'Garden', 'potting shed|florist|seed', 3, '#15803d');
sortRule('category', 'Woodwork', 'timber|tools|metalwork|chisel', 4, '#92400e');
sortRule('category', 'Climbing', 'climbing|chalk', 5, '#c2410c');
sortRule('category', 'Football', 'five-a-side|football', 6, '#166534');
sortRule('category', 'Health', 'health cover|chemist|pharmacy', 7, '#0e7490');
sortRule('category', 'Utilities', 'ease|water|fibre', 8, '#b45309');
sortRule('category', 'Farm food', 'farm|butcher|greengrocer', 9, '#4d7c0f');
sortRule('category', 'Groceries', 'supermarket|bakery', 10, '#1d4ed8');
sortRule('category', 'Transport', String.raw`fuel|ride \*`, 11, '#0369a1');
sortRule('category', 'Eating out', 'delivery|bistro|sushi', 12, '#be123c');
sortRule('category', 'Subscriptions', String.raw`subscription \*|sonora|reelbox`, 13, '#6d28d9');
sortRule('category', 'Savings', 'savings deposit|fixed income', 14, '#0f766e');
sortRule('tag', 'healthy', 'farm|greengrocer|climbing|five-a-side', 0, '#0f766e');
sortRule('tag', 'transfers', 'transfer', 1, '#9d174d');

// --- locations (inventory) -----------------------------------------------------------
//
// A small flat, so the tree has depth and the counts beside each location are
// worth reading — and so "where is the measuring tape" has a real answer.

const location = (name, parentId = null) => {
	const existing = one('select id from locations where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into locations (user_id, name, parent_id) values (?, ?, ?)',
		uid,
		name,
		parentId
	);
};

// A whole small flat rather than a corner of one: the panel is a tree, and a
// tree with four nodes and two things in it demonstrates nothing. Deep enough
// to show nesting (room → furniture → drawer), wide enough that the counts
// beside each location are worth reading.
const livingRoom = location('Living room');
const whiteChest = location('White chest', livingRoom);
const firstDrawer = location('First drawer', whiteChest);
const secondDrawer = location('Second drawer', whiteChest);
const bookshelf = location('Bookshelf', livingRoom);

const kitchenRoom = location('Kitchen');
const pantryLoc = location('Pantry', kitchenRoom);
const underSink = location('Under the sink', kitchenRoom);

const officeLocation = location('Office');
const deskDrawer = location('Desk drawer', officeLocation);

const bathroom = location('Bathroom');
const cabinet = location('Cabinet', bathroom);

/*
 * `attributes` left out means "leave whatever it has", not "wipe it".
 *
 * Several of these name a thing the shopping list already seeded with
 * attributes on it — dish soap is in the cupboard *and* under the sink — and
 * writing `{}` over it took them off again, so the item somebody opens from
 * the map of the home was the one with nothing to show.
 */
const filedItem = (name, locationId, attributes = null) => {
	const existing = one('select id from inventory_items where user_id = ? and name = ?', uid, name);
	const id =
		existing?.id ??
		run(
			"insert into inventory_items (user_id, name, type, bought) values (?, ?, 'someday', 1)",
			uid,
			name
		);
	run('update inventory_items set location_id = ? where id = ?', locationId, id);
	if (attributes)
		run('update inventory_items set attributes = ? where id = ?', JSON.stringify(attributes), id);
};

// The thing the whole feature exists to answer, and its neighbours.
filedItem('measuring tape', firstDrawer, { length: '5m', kind: 'construction' });
filedItem('spare keys', firstDrawer, { for: 'the front door' });
filedItem('sewing kit', secondDrawer, { contents: 'needles, thread, buttons', kind: 'household' });
filedItem('passport', secondDrawer, { expires: '2031-04' });
filedItem('board games', bookshelf, { count: '11', players: '2–6' });

filedItem('USB-C cable', deskDrawer, { plug: 'USB-C', speed: 'USB3' });
filedItem('HDMI cable', deskDrawer, { length: '2m' });
filedItem('label printer', officeLocation, { model: 'P710' });

filedItem('blender', kitchenRoom, { brand: 'Halovex', power: '600W', capacity: '1.5L' });
filedItem('bicarbonate of soda', pantryLoc, { weight: '250g', kind: 'baking' });
filedItem('dish soap', underSink);
filedItem('spare bulbs', underSink, { fitting: 'E27', watts: '9' });

filedItem('first aid kit', cabinet, { checked: '2026-02', kind: 'household' });
filedItem('hair clippers', cabinet, { guards: '3, 6, 9' });

// --- dashboard extras ---------------------------------------------------------------

quote('Plans are worthless, but planning is everything.', 'Eisenhower');
quote('A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry');
quote('What gets measured gets managed.', 'Peter Drucker');

win(today, 1, 'cleared the inbox');
win(today, 2, 'three hours of deep work');
win(iso(dayOffset(-1)), 1, 'ran 8km');

// --- the plugin platform --------------------------------------------------------------

apiToken('the scale app on my phone', 'schedule:read,streams:write');

// One webhook subscription, so the integrations page shows the card in use.
if (!one('select id from webhook_subscriptions where user_id = ?', uid)) {
	run(
		`insert into webhook_subscriptions (user_id, url, events, secret, created_at, updated_at)
		 values (?, 'https://example.com/ontoplano-hook', 'inventory.added,inventory.bought', ?, ?, ?)`,
		uid,
		`whsec_${randomBytes(24).toString('hex')}`,
		stamp(now),
		stamp(now)
	);
}
apiToken('scratch script', 'streams:read');
apiToken('Phone widget', 'today:read');
// Two calendar links, so /settings/integrations shows the list with its
// addresses rather than only the empty state. Each printed URL is
// `<origin>/calendar/<the token above>`, and both are fetchable straight away.
apiToken('Calendar link — phone', 'calendar:read');
apiToken('Calendar link — laptop', 'calendar:read');

// A few assistant calls, so "What your assistants did" shows its card in use —
// one plain write, one edit with its before, and one delete that can actually
// be put back from the seed data alone.
const assistantTokenId = apiToken(
	'AI assistant',
	'tasks:read,tasks:write,notes:read,notes:write,destructive'
);
const assistantCall = (tool, args, before, destroyed, hoursAgo) => {
	if (one('select id from assistant_calls where user_id = ? and tool = ?', uid, tool)) return;
	const at = new Date(now.getTime() - hoursAgo * 3600_000);
	run(
		`insert into assistant_calls (user_id, token_id, tool, args, before, destroyed, created_at)
		 values (?, ?, ?, ?, ?, ?, ?)`,
		uid,
		assistantTokenId,
		tool,
		JSON.stringify(args),
		before === null ? null : JSON.stringify(before),
		destroyed ? 1 : 0,
		stamp(at)
	);
};
assistantCall('add_todo', { title: 'book the dentist' }, null, false, 30);
assistantCall(
	'change_todo',
	{ id: 9001, title: 'book the dentist for Tuesday' },
	{ id: 9001, title: 'book the dentist', notes: '', status: 'todo' },
	false,
	29
);
assistantCall(
	'drop_todo',
	{ id: 9002 },
	{ id: 9002, title: 'return the drill', notes: 'to M.', status: 'todo', scheduledDate: null },
	true,
	5
);

// Instance data rather than the user's, but the settings page is a screen too:
// one invitation outstanding, one already spent.
const invite = (code, note, usedBy = null) => {
	if (one('select id from invites where code = ?', code)) return;
	run(
		`insert into invites (code, note, created_by, expires_at, used_at, used_by, created_at)
		 values (?, ?, ?, null, ?, ?, ?)`,
		code,
		note,
		uid,
		usedBy ? stamp(dayOffset(-2)) : null,
		usedBy,
		stamp(dayOffset(-10))
	);
};

// --- account history and plan -------------------------------------------------

const audit = (event, detail = {}, daysAgo = 0, actorId = null) => {
	if (one('select id from audit_events where user_id = ? and event = ?', uid, event)) return;
	run(
		'insert into audit_events (user_id, actor_id, event, detail, ip, created_at) values (?, ?, ?, ?, ?, ?)',
		uid,
		actorId,
		event,
		JSON.stringify(detail),
		'203.0.113.7',
		stamp(dayOffset(-daysAgo))
	);
};

audit('registered', {}, 60);
audit('signed_in', {}, 1);
audit('password_changed', {}, 21);
audit('data_exported', {}, 9);
audit('plan_changed', { to: 'pro', status: 'trialing' }, 60);

if (!one('select id from subscriptions where user_id = ?', uid)) {
	run(
		`insert into subscriptions
		 (user_id, plan, status, provider, current_period_end, trial_ends_at, created_at, updated_at)
		 values (?, 'pro', 'active', 'seed', ?, ?, ?, ?)`,
		uid,
		stamp(dayOffset(21)),
		stamp(dayOffset(-46)),
		stamp(dayOffset(-60)),
		stamp(now)
	);
}

invite('dev-invite-open-0001', 'for my brother');
invite('dev-invite-used-0002', 'for Ana', uid);

const weight = stream('scale.weight', 'Weight', 'measurement', 'kg', 'line_chart');
for (let back = 0; back < 30; back += 2) {
	const d = dayOffset(-back);
	point(weight, stamp(d), iso(d), Number((78 + Math.sin(back / 4) * 1.2).toFixed(1)));
}

// One stream with a retention window, so the settings page shows it in use.
const sleep = stream('scale.sleep', 'Sleep', 'measurement', 'h', 'bar_chart', 365);
for (let back = 0; back < 14; back++) {
	const d = dayOffset(-back);
	point(sleep, stamp(d), iso(d), Number((6.4 + ((back * 7) % 5) / 4).toFixed(1)));
}

// A plausible producer, and deliberately a generic one: this seed fills the
// public demo, which is no location to advertise anybody's particular app.
manifest(
	'scale',
	'Smart scale',
	'Weighs you, and sets alarms from the plan',
	JSON.stringify(['alarm', 'remind_min'])
);

// --- Recipes ------------------------------------------------------------------
//
// The loop this app is for: a recipe is a list of shopping items, a meal is a
// block with a recipe on it, and what the week needs minus what is in the
// cupboard is the shopping list.

const shoppingCategoryNamed = (name) =>
	one('select id from inventory_categories where user_id = ? and name = ?', uid, name);

// Pantry and fresh hold food; household does not.
for (const [name, isFood] of [
	['pantry', 1],
	['fresh', 1],
	['household', 0]
]) {
	const found = shoppingCategoryNamed(name);
	if (found)
		db.prepare('update inventory_categories set is_food = ? where id = ?').run(isFood, found.id);
}

const priced = (name, cents) => {
	const item = one('select id from inventory_items where user_id = ? and name = ?', uid, name);
	if (item)
		db.prepare('update inventory_items set price_cents = ? where id = ?').run(cents, item.id);
};

priced('coffee beans', 890);
priced('olive oil', 640);
priced('rice', 320);
priced('milk', 180);
priced('tomatoes', 250);
priced('eggs', 410);

const recipe = (title, extra = {}) => {
	const existing = one('select id from recipes where user_id = ? and title = ?', uid, title);
	if (existing) return existing.id;
	return run(
		`insert into recipes (user_id, title, method, servings, minutes, source, last_cooked_at)
		 values (?, ?, ?, ?, ?, ?, ?)`,
		uid,
		title,
		extra.method ?? '',
		extra.servings ?? null,
		extra.minutes ?? null,
		extra.source ?? '',
		extra.lastCookedAt ?? null
	);
};

/** What the staples a recipe conjures are like, so they are not bare names. */
const PANTRY_ATTRIBUTES = {
	pasta: { shape: 'penne', weight: '500g', brand: 'Semolo' },
	garlic: { variety: 'purple', kind: 'fresh' },
	'black beans': { weight: '1kg', variety: 'black' },
	'olive oil': { brand: 'Stonegrove', weight: '500ml' },
	onion: { variety: 'brown', kind: 'fresh' },
	rice: { brand: 'Harvestone', weight: '1kg' }
};

const ingredient = (recipeId, itemName, quantity, unit, note = '') => {
	let item = one('select id from inventory_items where user_id = ? and name = ?', uid, itemName);
	if (!item) {
		const pantry = shoppingCategoryNamed('pantry');
		const id = run(
			`insert into inventory_items (user_id, name, type, inventory_category_id, bought, attributes)
			 values (?, ?, 'replenish', ?, 0, ?)`,
			uid,
			itemName,
			pantry?.id ?? null,
			// A pantry staple has a size and a shelf life like everything else
			// in there; an ingredient conjured by a recipe used to have neither,
			// so half the cupboard was bare rows.
			JSON.stringify(PANTRY_ATTRIBUTES[itemName] ?? { kind: 'pantry staple' })
		);
		item = { id };
	}
	if (one('select id from recipe_items where recipe_id = ? and item_id = ?', recipeId, item.id))
		return;
	run(
		'insert into recipe_items (user_id, recipe_id, item_id, quantity, unit, note) values (?, ?, ?, ?, ?, ?)',
		uid,
		recipeId,
		item.id,
		quantity,
		unit,
		note
	);
};

const tomatoPasta = recipe('Tomato pasta', {
	servings: 2,
	minutes: 25,
	lastCookedAt: stamp(dayOffset(-4)),
	method:
		'## While the water boils\n\n1. Halve the tomatoes.\n2. Warm the oil, add the garlic, wait for the smell.\n\n## Then\n\n- Tomatoes in, salt, ten minutes.\n- Pasta in the sauce, never the other way round.'
});
ingredient(tomatoPasta, 'tomatoes', 400, 'g');
ingredient(tomatoPasta, 'olive oil', 2, 'tbsp');
ingredient(tomatoPasta, 'pasta', 200, 'g');
ingredient(tomatoPasta, 'garlic', 2, 'cloves', 'sliced thin');

const omelette = recipe('Omelette', {
	servings: 1,
	minutes: 10,
	method: 'Beat the eggs badly. Hot pan, cold butter, do not stir after the first ten seconds.'
});
ingredient(omelette, 'eggs', 3, '');
ingredient(omelette, 'olive oil', 1, 'tbsp');

const riceAndBeans = recipe('Rice and beans', {
	servings: 4,
	minutes: 45,
	source: 'my mother',
	method:
		'# Sunday\n\nSoak the beans the night before. Everything else is patience.\n\n- [ ] soak overnight\n- [ ] onion and garlic first'
});
ingredient(riceAndBeans, 'rice', 300, 'g');
ingredient(riceAndBeans, 'black beans', 400, 'g');
ingredient(riceAndBeans, 'garlic', 3, 'cloves');

// --- Workouts (Health) -----------------------------------------------------
//
// A few workouts, planned like meals, so the Health section has something to
// show and a workout can be dropped onto the week.

// The kinds are the account's own rows now, not five words in the schema, so
// the seed makes them the way a first visit to the page would.
const workoutKind = (name, sortOrder) => {
	const existing = one(
		'select id from workout_categories where user_id = ? and name = ?',
		uid,
		name
	);
	if (existing) return existing.id;
	return run(
		'insert into workout_categories (user_id, name, sort_order) values (?, ?, ?)',
		uid,
		name,
		sortOrder
	);
};

['Strength', 'Cardio', 'Mobility', 'Sport', 'Other'].forEach(workoutKind);

const workout = (title, kindName, plan, extra = {}) => {
	const existing = one('select id from workouts where user_id = ? and title = ?', uid, title);
	if (existing) return existing.id;
	const kind = one(
		'select id from workout_categories where user_id = ? and name = ?',
		uid,
		kindName
	);
	return run(
		'insert into workouts (user_id, title, category_id, plan, minutes) values (?, ?, ?, ?, ?)',
		uid,
		title,
		kind?.id ?? null,
		plan,
		extra.minutes ?? null
	);
};

workout('Push day', 'Strength', 'Bench, overhead press, dips, triceps. 4×8.', { minutes: 55 });
workout('Pull day', 'Strength', 'Rows, pulldowns, curls, face pulls. 4×8.', { minutes: 55 });
workout('Easy 5k', 'Cardio', 'Conversational pace, flat route.', { minutes: 30 });
workout('Mobility', 'Mobility', 'Hips, shoulders, ankles. Follow the video.', { minutes: 20 });

// The register under them: what was actually done, and how much of it.
//
// Several weeks of it, and going up, because a screenshot of one session is a
// screenshot of an empty feature — the point of the numbers is the shape they
// make over time. The dates are counted back from today so the seed is never
// a museum of last spring.
const pushPlan = one('select id from workouts where user_id = ? and title = ?', uid, 'Push day');
const pullPlan = one('select id from workouts where user_id = ? and title = ?', uid, 'Pull day');
const runPlan = one('select id from workouts where user_id = ? and title = ?', uid, 'Easy 5k');

const daysBack = (days) => {
	const day = new Date();
	day.setDate(day.getDate() - days);
	return day.toISOString().slice(0, 10);
};

const session = (workoutId, days, lines, notes = '') => {
	if (!workoutId) return;
	const doneOn = daysBack(days);
	const already = one(
		'select id from workout_sessions where user_id = ? and workout_id = ? and done_on = ?',
		uid,
		workoutId,
		doneOn
	);
	if (already) return;

	const id = run(
		'insert into workout_sessions (user_id, workout_id, done_on, notes) values (?, ?, ?, ?)',
		uid,
		workoutId,
		doneOn,
		notes
	);
	lines.forEach(([activity, amount, unit], index) =>
		run(
			'insert into workout_measures (user_id, session_id, activity, amount, unit, sort_order) values (?, ?, ?, ?, ?, ?)',
			uid,
			id,
			activity,
			amount,
			unit,
			index
		)
	);
	run('update workouts set last_done_at = ? where id = ? and user_id = ?', doneOn, workoutId, uid);
};

// Bench going up five kilos a month, which is what somebody keeping a register
// is looking for when they open it.
[
	[38, 72.5, 8],
	[31, 75, 8],
	[24, 75, 10],
	[17, 77.5, 8],
	[10, 80, 8],
	[3, 80, 10]
].forEach(([days, kilos, reps]) =>
	session(pushPlan?.id, days, [
		['benched', kilos, 'kg'],
		['for', reps, 'reps'],
		['overhead pressed', Math.round(kilos * 0.55 * 2) / 2, 'kg']
	])
);

[
	[35, 100],
	[28, 105],
	[21, 110],
	[14, 110],
	[7, 115]
].forEach(([days, kilos], index) =>
	session(
		pullPlan?.id,
		days,
		[
			['deadlifted', kilos, 'kg'],
			['rowed', Math.round(kilos * 0.6), 'kg']
		],
		index === 2 ? 'Back was tight — kept it light on the rows.' : ''
	)
);

[
	[33, 5.1, 29],
	[26, 5.4, 30],
	[19, 6.2, 34],
	[12, 5.0, 27],
	[5, 7.1, 39]
].forEach(([days, km, minutes]) =>
	session(runPlan?.id, days, [
		['ran', km, 'km'],
		['for', minutes, 'min']
	])
);

// --- Pictures ---------------------------------------------------------------
//
// Two of them, drawn here rather than shipped as files: a seed that carries
// binaries is a seed nobody reviews, and the point is a database with a little
// of everything in it, not a photograph.
//
// They are real pictures, cropped to the shapes this app draws them in by
// `yarn demo-media`: generated faces for the people — nobody here is a
// photograph of a real person — and CC0 works from the Metropolitan Museum's
// Open Access collection for the rest. `scripts/demo-media/SOURCES.md` says
// which is which.
//
// They used to be squares of one colour, generated here. The bytes were a valid
// PNG and nothing else about them was a picture: a beige rectangle under a note
// about a trip reads as a broken feature rather than a seeded one, and a demo
// is a claim about what the app looks like when somebody is using it.

/**
 * One of the files in `scripts/demo-media/`, as bytes — or nothing.
 *
 * Nothing, rather than a thrown error, because of what a thrown error cost the
 * one time it happened: the deploy shipped four named scripts to the demo box
 * and not this directory, so the first picture threw, the seed stopped where it
 * stood, and everything below this point — a notebook's worth of reading notes,
 * nine weeks of history, the reviews — simply did not exist on the demo. A
 * missing decoration must never take the data with it.
 */
function demoPicture(name) {
	try {
		return readFileSync(join(here, 'demo-media', name));
	} catch {
		console.warn(`  no picture at scripts/demo-media/${name} — seeding the rest without it`);
		return null;
	}
}

/** Stores one, and answers with its id — or null, if there was nothing to store. */
const picture = (filename, alt, bytes) => {
	if (!bytes) return null;
	const sha = createHash('sha256').update(bytes).digest('hex');
	const existing = one('select id from media where user_id = ? and sha256 = ?', uid, sha);
	if (existing) return existing.id;
	return run(
		`insert into media (user_id, mime, filename, alt, byte_size, bytes, sha256, created_at)
		 values (?, 'image/jpeg', ?, ?, ?, ?, ?, ?)`,
		uid,
		filename,
		alt,
		bytes.length,
		bytes,
		sha,
		stamp(now)
	);
};

// A face, so the people page is a page of people rather than of names.
/*
 * Everybody, not just Ana.
 *
 * One face among four initials looked like a feature that had half worked. The
 * whole point of the page is that a list of faces is a list of people, and it
 * only reads that way when every row has one.
 */
for (const [id, name, file] of [
	[ana, 'Ana', 'ana.jpg'],
	[joao, 'João', 'joao.jpg'],
	[marco, 'Marco', 'marco.jpg'],
	[mum, 'Mum', 'mum.jpg']
]) {
	const face = picture(file, name, demoPicture(file));
	if (face && !one('select id from people where id = ? and picture_id is not null', id))
		db.prepare('update people set picture_id = ? where id = ? and user_id = ?').run(face, id, uid);
}

/*
 * And one inside somebody's writing, which is the other way a picture exists
 * here: markdown in the text, pointing at `/media/<id>`.
 *
 * Appended to an entry that already belongs to a notebook, so the demo shows a
 * notebook with a picture in it rather than a bare one.
 */
/*
 * The one picture inside somebody's writing: a horse, in the trip notebook,
 * which is a photograph a traveller would actually keep. The kitchen notebook
 * used to carry a 17th-century painting captioned as a shelf reference, and
 * however it was framed it read as a non sequitur — a notebook of quotes and
 * measurements argues for itself better in words.
 *
 * Written into the entry that is already there rather than appended as a bare
 * line: a picture in this app lives inside the writing, and a demo showing one
 * stranded under a paragraph is showing the wrong thing.
 */
const horsePicture = picture(
	'horse.jpg',
	'A Lusitano in a field near Comporta',
	demoPicture('horse.jpg')
);
if (horsePicture) {
	const entry = one(
		'select id, content from diary_entries where user_id = ? and notebook_id = ? order by id limit 1',
		uid,
		portugal
	);
	const reference = `![A Lusitano in a field near Comporta](/media/${horsePicture})`;
	if (entry && !entry.content.includes(reference))
		db.prepare('update diary_entries set content = ? where id = ?').run(
			`${entry.content}\n\nThe stables outside Comporta will take us out on the Wednesday.\n\n${reference}`,
			entry.id
		);
}

/*
 * A cover on every notebook.
 *
 * A shelf is picked by looking at it — that is the whole reason the notebooks
 * page draws covers rather than rows — and a shelf of blank dashed rectangles
 * demonstrates the placeholder. Photographs rather than paintings: a framed
 * oil on a renovation reads as a museum catalogue.
 */
for (const [id, file, alt] of [
	[kitchen, 'cover-kitchen.jpg', 'Stonework, before the scaffolding'],
	[portugal, 'cover-portugal.jpg', 'A barque at anchor in the bay'],
	[readingNotebook, 'cover-reading.jpg', 'A long garden and the pavilion at the end of it'],
	[republic, 'cover-republic.jpg', 'A soldier, photographed in 1859']
]) {
	const cover = picture(file, alt, demoPicture(file));
	if (cover && !one('select id from notebooks where id = ? and picture_id is not null', id))
		db.prepare('update notebooks set picture_id = ? where id = ? and user_id = ?').run(
			cover,
			id,
			uid
		);
}

const pastaPicture = picture(
	'tomato-pasta.jpg',
	'Tomatoes for the sauce',
	demoPicture('tomato-pasta.jpg')
);
// Any picture at all, not this one: a recipe holds one main picture, and the
// one it has may be an older demo picture or one attached by hand.
if (
	pastaPicture &&
	!one('select id from recipe_images where user_id = ? and recipe_id = ?', uid, tomatoPasta)
)
	run(
		`insert into recipe_images (user_id, recipe_id, media_id, position, is_main, created_at)
		 values (?, ?, ?, 0, 1, ?)`,
		uid,
		tomatoPasta,
		pastaPicture,
		stamp(now)
	);

// --- gallery ---------------------------------------------------------------------
//
// Two albums over the same demo pictures, one picture living in both — the
// reference-not-copy behaviour is the thing worth seeing seeded. Tags come
// from the shared tags table, like the diary's.

const album = (name, sortOrder) => {
	const existing = one('select id from albums where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		'insert into albums (user_id, name, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?)',
		uid,
		name,
		sortOrder,
		stamp(now),
		stamp(now)
	);
};
const inAlbum = (albumId, mediaId) => {
	if (!mediaId) return;
	if (one('select id from album_media where album_id = ? and media_id = ?', albumId, mediaId))
		return;
	run(
		'insert into album_media (user_id, album_id, media_id, added_at) values (?, ?, ?, ?)',
		uid,
		albumId,
		mediaId,
		stamp(now)
	);
};

/*
 * Estevão's own photographs, when they are there.
 *
 * `scripts/demo-media/birds/` is his — gitignored, his copyright, his to
 * compress — and the seed reads whatever it finds there, folders and all:
 * `birds/herons/a.jpg` becomes the album "Birds — Herons", the same reading
 * the folder import in the gallery gives. With the directory absent the seed
 * says so once and carries on, like every other picture here.
 */
/**
 * The biggest a seeded photograph may be, and how far down to scale it.
 *
 * A camera's JPEG is five to seven megabytes, and this instance refuses
 * anything over five hundred kilobytes — so storing the originals would fill
 * the seeded gallery with pictures the app itself would not have accepted,
 * and serve seven megabytes to draw a thumbnail. The originals on disk are
 * untouched; what is stored is what an upload would have looked like.
 */
const SEEDED_PICTURE_KB = 480;
const SEEDED_PICTURE_EDGE = 1600;

/**
 * A photograph at a size this app would take, or the bytes as they are.
 *
 * ImageMagick when it is there — it already is, for the Android icons — and
 * the original otherwise, because a missing tool must not cost the seed its
 * gallery. Said once, not once per picture.
 */
let magick = 'unknown';
function scaled(from) {
	const original = readFileSync(from);
	if (original.length <= SEEDED_PICTURE_KB * 1024) return original;

	if (magick === 'unknown') {
		try {
			execFileSync('magick', ['-version'], { stdio: 'ignore' });
			magick = 'yes';
		} catch {
			magick = 'no';
			console.log(
				`  no imagemagick here, so photographs are seeded at their own size — ` +
					`bigger than the ${SEEDED_PICTURE_KB}KB this instance accepts`
			);
		}
	}
	if (magick === 'no') return original;

	const dir = mkdtempSync(join(tmpdir(), 'ontoplano-seed-'));
	const out = join(dir, 'scaled.jpg');
	try {
		execFileSync('magick', [
			from,
			'-auto-orient',
			'-resize',
			`${SEEDED_PICTURE_EDGE}x${SEEDED_PICTURE_EDGE}>`,
			'-define',
			`jpeg:extent=${SEEDED_PICTURE_KB}kb`,
			out
		]);
		return readFileSync(out);
	} catch {
		return original;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function seedPictureFolders(root, label) {
	let dirents;
	try {
		dirents = readdirSync(join(here, 'demo-media', root), { withFileTypes: true, recursive: true });
	} catch {
		console.log(`  no scripts/demo-media/${root}/ — seeding the gallery without it`);
		return 0;
	}

	const titled = (parts) =>
		[label, ...parts]
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/[-_]+/g, ' '))
			.join(' — ');

	// The root the subfolders hang off. Without it `Birds — Falconiformes`
	// has no ancestor in the table and the gallery draws ten roots instead of
	// one album with ten inside.
	album(titled([]), 89);

	let stored = 0;
	for (const entry of dirents) {
		if (!entry.isFile() || !/\.(jpe?g|png|webp|gif)$/i.test(entry.name)) continue;
		const from = join(entry.parentPath ?? entry.path, entry.name);
		const inside = relative(join(here, 'demo-media', root), from).split(sep);
		inside.pop();

		const albumId = album(titled(inside), 90 + stored);
		const mediaId = picture(entry.name, entry.name.replace(/\.[^.]+$/, ''), scaled(from));
		if (!mediaId) continue;
		inAlbum(albumId, mediaId);
		stored += 1;
	}
	if (stored > 0) console.log(`  ${stored} pictures from demo-media/${root}/`);
	return stored;
}

const tripsAlbum = album('Portugal', 0);
const kitchenAlbum = album('Kitchen', 1);
const kitchenPicture = picture('kitchen.jpg', 'The kitchen shelf', demoPicture('kitchen.jpg'));
// The pasta shot belongs to both — one picture, two albums, which is the
// thing the gallery has to handle and the thing a screenshot has to show.
// Added first in each so it is not the cover of either: an album card shows
// its newest membership, and two albums wearing the same photograph looks
// like the covers are broken rather than like a picture is shared.
inAlbum(kitchenAlbum, pastaPicture);
inAlbum(tripsAlbum, pastaPicture);
inAlbum(kitchenAlbum, kitchenPicture);
inAlbum(tripsAlbum, horsePicture);
seedPictureFolders('birds', 'birds');

if (pastaPicture) {
	const foodTag = tag('food');
	if (!one('select id from media_tags where media_id = ? and tag_id = ?', pastaPicture, foodTag))
		run(
			'insert into media_tags (user_id, media_id, tag_id) values (?, ?, ?)',
			uid,
			pastaPicture,
			foodTag
		);
}

/*
 * Pictures inside notes, which is a different thing from pictures in an album.
 *
 * A picture in a note is markdown pointing at `/media/<id>` and nothing
 * records which notebook it is in — the gallery works that out by reading the
 * writing, which is what puts the "Notebooks" album there. Without this the
 * album is empty on a fresh dev database and the whole feature is invisible
 * until somebody hand-writes a note with a photograph in it.
 */
const pictureInNote = (seq, mediaId, alt) => {
	if (!mediaId) return;
	const entry = one(
		'select id, content from diary_entries where user_id = ? and seq = ?',
		uid,
		seq
	);
	if (!entry || entry.content.includes(`/media/${mediaId}`)) return;
	run(
		'update diary_entries set content = ? where id = ?',
		`${entry.content}\n\n![${alt}](/media/${mediaId})`,
		entry.id
	);
};

/*
 * And a notebook inside a notebook, so the folder tree is a tree.
 *
 * `Kitchen renovation — Countertops` is one notebook inside another for the
 * same reason `Birds — Passeriformes` is one album inside another: the
 * separator is the relationship. The gallery draws it as a folder inside a
 * folder, and nothing anywhere had two levels of it to draw.
 */
const countertops = notebook(
	'Kitchen renovation — Countertops',
	'The three quotes, and what each of them actually includes.'
);
diary(
	30,
	'Granite from the second place, and they measured the corner properly. The other two quoted from the drawing.',
	['home']
);
inNotebook('diary_entries', 'seq', 30, countertops);

// Different pictures in the parent and the child, so the folder above counts
// two and the one inside counts one — a tree with the same photograph twice
// counts it once and looks like the totals are broken.
pictureInNote(5, kitchenPicture, 'The kitchen shelf');
pictureInNote(30, pastaPicture, 'The corner they measured');
pictureInNote(7, horsePicture, 'On the way out of Lisbon');

// A meal is a block with a recipe on it, on the grid with everything else.
const dinner = one("select id from recurring_tasks where user_id = ? and label = 'cooking'", uid);
if (dinner)
	db.prepare('update recurring_tasks set recipe_id = ? where id = ?').run(tomatoPasta, dinner.id);

// --- The week before last, closed ------------------------------------------------
//
// Two reviews, so the dashboard's "last week is still open" prompt has
// something to be quiet about *and* the review page has a written-up week to
// page back to. Last week is deliberately left unwritten: that is the state
// the prompt exists for.

const mondayBefore = (weeksAgo) => {
	const d = new Date(now);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * weeksAgo);
	return iso(d);
};

const reviewLine = (weekStart, position, content) => {
	const existing = one(
		'select id from weekly_reviews where user_id = ? and week_start = ? and position = ?',
		uid,
		weekStart,
		position
	);
	if (existing) return existing.id;
	return run(
		'insert into weekly_reviews (user_id, week_start, position, content) values (?, ?, ?, ?)',
		uid,
		weekStart,
		position,
		content
	);
};

reviewLine(mondayBefore(2), 1, 'Mornings held. Everything before ten actually happened.');
reviewLine(mondayBefore(2), 2, 'Thursday went sideways and took Friday with it.');
reviewLine(mondayBefore(2), 3, 'Stop putting deep work after lunch.');

reviewLine(mondayBefore(3), 1, 'Cooked at home five nights out of seven.');
reviewLine(mondayBefore(3), 2, 'Read almost nothing.');

// --- Things that never ended ------------------------------------------------------
//
// So the review's "Still here" section has something to ask about. Backdated
// rather than created old, because the row's own timestamp is what the query
// reads.

const monthsAgo = (n) => {
	const d = new Date(now);
	d.setMonth(d.getMonth() - n);
	return `${iso(d)} 09:00:00`;
};

const age = (table, match, when) => {
	const row = one(
		`select id from ${table} where user_id = ? and ${match.column} = ?`,
		uid,
		match.value
	);
	if (row) db.prepare(`update ${table} set updated_at = ? where id = ?`).run(when, row.id);
};

const forgottenTodo = one(
	'select id from todo_tasks where user_id = ? and title = ?',
	uid,
	'learn a bit of woodworking'
);
if (!forgottenTodo)
	run(
		'insert into todo_tasks (user_id, title, status, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
		uid,
		'learn a bit of woodworking',
		'todo',
		9000,
		monthsAgo(7),
		monthsAgo(7)
	);

idea('Learn to sail, properly, not just crewing for other people', ['someday']);
shoppingItem('a proper armchair', 'someday', {
	categoryId: household,
	attributes: { budget: '2500', material: 'leather', colour: 'tan' }
});

age(
	'ideas',
	{ column: 'content', value: 'Learn to sail, properly, not just crewing for other people' },
	monthsAgo(5)
);
age('inventory_items', { column: 'name', value: 'a proper armchair' }, monthsAgo(9));

// --- What things have actually cost -----------------------------------------------
//
// Two purchases of the same thing at different prices, so the shopping list has
// a drift to show. One point says nothing; the sentence starts at two.

const pricePoint = (itemName, cents, when) => {
	const item = one('select id from inventory_items where user_id = ? and name = ?', uid, itemName);
	if (!item) return;
	const already = one(
		'select id from price_points where user_id = ? and item_id = ? and for_date = ?',
		uid,
		item.id,
		when
	);
	if (already) return;
	run(
		'insert into price_points (user_id, item_id, price_cents, for_date) values (?, ?, ?, ?)',
		uid,
		item.id,
		cents,
		when
	);
	db.prepare('update inventory_items set price_cents = ? where id = ?').run(cents, item.id);
};

pricePoint('coffee beans', 720, iso(dayOffset(-190)));
pricePoint('coffee beans', 890, iso(dayOffset(-40)));
pricePoint('olive oil', 640, iso(dayOffset(-120)));
pricePoint('olive oil', 590, iso(dayOffset(-15)));

// --- Reminders --------------------------------------------------------------------
//
// One already overdue, so the dashboard has something to deliver the moment you
// open it, and one later today that has not gone off yet.

const zone =
	one("select value from user_settings where user_id = ? and key = 'user.timezone'", uid)?.value ||
	'UTC';

const localStamp = (offsetMinutes) => {
	const at = new Date(Date.now() + offsetMinutes * 60_000);
	const formatted = new Intl.DateTimeFormat('sv-SE', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(at);
	return `${formatted.replace(' ', 'T')}:00`;
};

/**
 * A nudge before an occurrence, which is the only kind there is.
 *
 * It used to seed two "free" reminders — a message and a clock reading, about
 * nothing — and they turned up as a card in the corner of the demo that
 * appeared in no list anywhere, because there was no list for them. There is
 * one kind now: it hangs off a block, and the block is what carries the lead.
 */
const reminder = (recordId, leadMinutes, message) => {
	const at = one('select scheduled_at from task_records where id = ?', recordId);
	if (!at) return null;

	const when = new Date(at.scheduled_at.slice(0, 19));
	when.setMinutes(when.getMinutes() - leadMinutes);
	const pad = (n) => String(n).padStart(2, '0');
	const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}:00`;

	const existing = one(
		'select id from reminders where user_id = ? and subject_id = ? and remind_at = ?',
		uid,
		recordId,
		stamp
	);
	if (existing) return existing.id;

	return run(
		'insert into reminders (user_id, subject_kind, subject_id, remind_at, message) values (?, ?, ?, ?, ?)',
		uid,
		'instance',
		recordId,
		stamp,
		message
	);
};

// The next two things on the plan get one each, so the demo shows a reminder
// arriving about something the visitor can actually go and look at.
for (const row of all(
	'select id from task_records where user_id = ? and scheduled_at >= ? order by scheduled_at limit 2',
	uid,
	localStamp(-30)
)) {
	reminder(row.id, 10, 'Coming up in ten minutes');
}

// --- mail that did not go out (the /admin card and the /healthz warning) --------

const mailFailure = (kind, toEmail, subject, error, bodyText) => {
	const existing = one(
		'select id from mail_failures where kind = ? and to_email = ? and resolved_at is null',
		kind,
		toEmail
	);
	if (existing) return existing.id;
	return run(
		`insert into mail_failures (kind, to_email, subject, error, attempts, body_text, created_at, last_attempt_at)
		 values (?, ?, ?, ?, ?, ?, ?, ?)`,
		kind,
		toEmail,
		subject,
		error,
		kind === 'trial-notice' ? 3 : 1,
		bodyText,
		stamp(new Date(now.getTime() - 26 * 3600_000)),
		stamp(new Date(now.getTime() - 2 * 3600_000))
	);
};

mailFailure(
	'trial-notice',
	'marina@ontoplano.test',
	'Your ontoplano trial ends on ' + iso(new Date(now.getTime() + 2 * 86400_000)),
	'connect ECONNREFUSED 127.0.0.1:25',
	'Your trial ends in two days — everything you wrote stays yours and stays readable.'
);
mailFailure(
	'verification',
	'joao@ontoplano.test',
	'Confirm your ontoplano address',
	'454 4.7.1 Relay access denied',
	null
);

// --- Two months of somebody actually using it ---------------------------------
//
// Everything above builds an account with one of each thing in it, which is
// what a developer needs and not what a visitor should meet. The demo is
// somebody's first look at the app, and an account with four diary entries and
// no completed anything reads as abandoned — the planner's whole argument is
// the record it builds up, and there was nothing to look at.
//
// So this fills the last nine weeks in: occurrences that were kept, moved and
// missed, habits with gaps in them, notes long enough to be worth reading, a
// review written most weeks, and todos finished at the time they were
// finished. Deterministic, because a demo that reshuffles itself every hour is
// one nobody can point at twice.

/** A small deterministic generator, so the seeded past is the same every run. */
let seedState = 20260830;
const rand = () => {
	seedState = (seedState * 1664525 + 1013904223) % 4294967296;
	return seedState / 4294967296;
};

const HISTORY_WEEKS = 9;
const dayAt = (daysAgo) => {
	const d = new Date(now);
	d.setDate(d.getDate() - daysAgo);
	return d;
};

// --- A notebook with something in it ------------------------------------------

const REPUBLIC_NOTES = [
	[
		20,
		56,
		`## Book I — Thrasymachus

Justice is whatever serves the strong. He is not a strawman; he is the most
modern voice in the room, and he says it without embarrassment:

> I proclaim that justice is nothing else than the interest of the stronger.

Socrates does not really refute him here. He ties him in knots about whether a
craft serves itself or its object, Thrasymachus gets annoyed and gives up, and
the argument is left standing.

Everything after this is Plato admitting that and starting again properly —
worth remembering when people quote the later books as if the case had been
settled in the first one.`
	],
	[
		21,
		49,
		`## Book II — the ring of Gyges

Glaucon's version of the challenge is much better than Thrasymachus's. Give
two men a ring that makes them invisible:

- one who has spent his life being just
- one who has spent it being unjust

Then watch. If neither behaves differently once nobody can see, justice was
only ever reputation.

The question is not **why be good**. It is *would you still be, with no
consequences* — and two and a half thousand years later nobody has improved
the framing. See #20 for the version he is improving on.`
	],
	[
		22,
		41,
		`## Books II–IV — the city, and the sleight of hand

He tells you it is a trick, which is the part people forget: justice is hard
to see in one person, so let us look at it *written large* in a city and then
read it back.

So everything about the ideal state is really a claim about the parts of a mind:

- the guardians — the part that reasons
- the auxiliaries — the part that gets angry on your behalf
- the producers — the part that wants

Which is a relief, because taken as politics it is monstrous — the censorship,
the lie about the metals, breeding people like dogs. Taken as psychology it is
sharp. The angry part is the interesting one: it is not reason and it is not
appetite, and it takes reason's side against your own wanting.`
	],
	[
		23,
		33,
		`## Book V — the part nobody quotes at dinner

Three waves, each one more embarrassing than the last, and he knows it:

1. the same education for women, on the grounds that the difference does not
   bear on the work — startling for the century, and then
2. no families among the guardians: partners assigned, children raised in
   common and never told whose they are
3. philosophers as kings, which is the one everyone remembers because it is
   the one that flatters philosophers

The second is where it turns. His argument is that private love is the seed of
private interest, so the city must have none — and a city that has abolished
the family in order to be just has stopped being a city anybody would want to
live in. **The reasoning is careful and the conclusion is a horror.** That
combination is the whole difficulty with this book.`
	],
	[
		24,
		26,
		`## Book VII — the cave

Everyone knows the image and almost nobody mentions the ending.

The one who gets out and comes back is not thanked. His eyes have adjusted, so
he is now *worse* at the shadow game than the people who never left, and they
draw the obvious conclusion:

> And if anyone tried to loose another and lead him up to the light, let them
> only catch the offender, and they would put him to death.

Written by a man whose teacher was executed by his own city.

It is not a metaphor about ignorance. It is about what happens to the person
who says so.`
	],
	[
		25,
		21,
		`## Books VIII–IX — how it comes apart

The best chapter, and the one that reads like it was written last week. Each
constitution decays into the next by its own virtue overshooting:

- **timocracy** — honour, until honour is only ambition
- **oligarchy** — thrift, until the city is two cities, the rich and the poor,
  plotting against each other
- **democracy** — freedom, until nothing can be asked of anybody
- **tyranny** — the man who arrives promising to protect the people from the
  ones who have everything, and stays

The democratic man is the passage to sit with. He treats every appetite as
equally worth satisfying, "calling insolence good breeding, and anarchy
liberty" — not because he is wicked but because he has no principle for
ranking anything. He does not fall to a tyrant. He *asks* for one, because a
man with a single overriding want is the only thing he has ever seen that
looks like order.`
	],
	[
		26,
		18,
		`## Book X — done

He throws the poets out, and then closes the book with the myth of Er: a story
about the afterlife, told as the last word. Either he knew exactly what he was
doing or he could not help himself, and I do not think Plato could not help
himself about anything.

**Where I have landed, two months in:**

- The political programme is indefensible and he half-knows it — see #23.
- The psychology is still the best thing anybody has written about wanting two
  things at once.
- Book I is the honest one; the rest is a very long answer to it.

Read the middle books. Argue with the rest.

Still want a decent secondary reader on Books VIII–IX.`
	]
];

for (const [seq, daysAgo, content] of REPUBLIC_NOTES) {
	diary(seq, content, [], iso(dayAt(daysAgo)));
	inNotebook('diary_entries', 'seq', seq, republic);
}

todo('finish Book VIII before the group meets', { status: 'done', sortOrder: 9400 });
inNotebook('todo_tasks', 'title', 'finish Book VIII before the group meets', republic);

// The weekly plan as it stands, which is what the past is generated from: the
// blocks somebody has been keeping are the blocks they have.
const plannedSlots = db
	.prepare(
		'select id, weekday, start_time as startTime from recurring_tasks where user_id = ? and active = 1'
	)
	.all(uid);

let kept = 0;
for (let daysAgo = 1; daysAgo <= HISTORY_WEEKS * 7; daysAgo++) {
	const day = dayAt(daysAgo);
	const weekday = (day.getDay() + 6) % 7;
	const date = iso(day);

	for (const s of plannedSlots) {
		if (s.weekday !== weekday) continue;
		const roll = rand();
		// Most of it happened. A tenth was missed, and a few of the last days
		// are still open, which is what an account in use looks like — not a
		// wall of green.
		const status = roll < 0.78 ? 'done' : roll < 0.9 ? 'skipped' : daysAgo < 4 ? 'todo' : 'done';
		instance(s.id, `${date}T${s.startTime}:00`, status, {
			completedAt: status === 'done' ? `${date}T${s.startTime}:00` : null
		});
		if (status === 'done') kept++;
	}
}

/*
 * Habits over a year, not over the nine weeks.
 *
 * A habit's history is drawn as a 365-day heatmap, so nine weeks of it fills a
 * sixth of the square and leaves five sixths of empty cells — which reads as a
 * habit nobody has ever kept rather than as a demo that starts nine weeks ago.
 * Blocks have no year-long view to fill, which is why they keep the shorter
 * window and the cheaper seed.
 *
 * With holes in it, because a heatmap that is solid says nothing and a habit
 * nobody ever breaks is not a habit.
 */
const HABIT_HISTORY_DAYS = 365;
for (let daysAgo = 1; daysAgo <= HABIT_HISTORY_DAYS; daysAgo++) {
	const date = iso(dayAt(daysAgo));
	const dow = (dayAt(daysAgo).getDay() + 6) % 7;
	if (rand() < 0.82) logHabit(water, date);
	if (dow < 5 && rand() < 0.66) logHabit(readBeforeBed, date);
	if (rand() < 0.24) logHabit(doomscroll, date);
	if (rand() < 0.7) logHabit(coffee, date);
}

// Notes worth opening. The ones above are one line each, which is a demo of a
// text field rather than of a notebook.
const longNotes = [
	[
		9,
		readingNotebook,
		21,
		`Finished Piranesi. Two evenings, which is not how I meant to read it.

The trick of it is that the narrator is entirely reliable and entirely wrong, and you work out the second thing about sixty pages before he does. That gap is the whole book. Most unreliable narrators lie to you; this one is honest about a world he has misunderstood, which is much closer to how being wrong actually feels.

Worth keeping: the diary form does a lot of the work. He is writing things down to hold onto them, which is the same reason I am.`
	],
	[
		10,
		kitchen,
		34,
		`## Three quotes in

All three agree the pipes have to move. They disagree about **the wall**, and
the price follows from that:

1. take the wall out, move the pipes, rebuild — €4,100
2. same, keeping the existing opening — €3,850
3. leave the wall, box the pipes in along it — €780

The third is either right or about to cost me a ceiling. Ringing the building
manager on Monday to find out whether the wall is holding anything up.

Nothing gets ordered until that is settled: the counter is the expensive part
and it is cut to whatever the wall ends up being.`
	],
	[
		11,
		portugal,
		12,
		`## Route settled

- **Lisbon** — three nights
- **Évora** — two nights, arriving on the 09:20
- **the coast** — whatever is left

The train south runs twice a day and the afternoon one arrives after
everything closes, so it has to be the morning one. That fixes the Évora
departure and everything else falls out of it.

> Still open: whether to keep the last two days loose. Every trip I have
> planned to the hour I have then spent rearranging.`
	],
	[
		12,
		null,
		45,
		`## A month of doing this properly

What has actually changed, as opposed to what I meant to change.

**Mornings hold.** The block before ten is the only one I never move, and it is the only reason anything long ever gets finished.

**Afternoons are fiction.** I plan two hours of deep work at 14:00 and spend it on mail, every time. That block should say *admin* and I should stop pretending otherwise.

---

The shopping list turned out to be the thing I use most, which I did not
expect. It is the only part that goes in my pocket.`
	]
];

for (const [seq, book, daysAgo, content] of longNotes) {
	diary(seq, content, [], iso(dayAt(daysAgo)));
	if (book) inNotebook('diary_entries', 'seq', seq, book);
}

/*
 * The kitchen notebook opens on the quotes, not on the one-liner.
 *
 * Entries render newest-first, and both of these land in the same second when
 * the seed runs, so which led was luck — and the screenshots kept opening on
 * "The plumber says the wall can go", which tells a stranger nothing. The
 * note with the substance gets the newer stamp.
 */
run(
	"update diary_entries set created_at = datetime('now', '-2 days') where user_id = ? and seq = 5",
	uid
);
run("update diary_entries set created_at = datetime('now') where user_id = ? and seq = 10", uid);

/*
 * Numbers past everything already written, rather than the next free-looking
 * ones: `diary()` returns the existing row for a number already used, so a
 * guess at a gap moves somebody else's note into this notebook instead of
 * writing a new one. Read from the database because the notes above are
 * spread over the whole file.
 */
const afterEverything =
	(one('select max(seq) v from diary_entries where user_id = ?', uid)?.v ?? 0) + 1;
const KITCHEN_NOTE_SEQ = afterEverything;
const TWELVE_NOTE_SEQ = afterEverything + 1;

/*
 * A notebook that points at its own tasks.
 *
 * `TASK:#4` in a note is how somebody writing up where a job stands refers to
 * the thing that has to happen, and it was the one part of a notebook nothing
 * seeded demonstrated — so the reference rendered as the literal text on the
 * one screen where it is meant to render as the task. The kitchen is the case
 * for it: a list of quotes is only interesting next to what is blocked on it.
 *
 * The numbers are the order these were inserted in, which is what
 * `inNotebook` numbers by.
 */
todo('ring the building manager about the wall', { urgency: 4, interest: 2, sortOrder: 10 });
todo('order the counter once the wall is settled', { urgency: 2, interest: 4, sortOrder: 11 });
todo('clear the cupboards before the fitters come', { urgency: 1, interest: 1, sortOrder: 12 });
inNotebook('todo_tasks', 'title', 'ring the building manager about the wall', kitchen);
inNotebook('todo_tasks', 'title', 'order the counter once the wall is settled', kitchen);
inNotebook('todo_tasks', 'title', 'clear the cupboards before the fitters come', kitchen);

diary(
	KITCHEN_NOTE_SEQ,
	`## Where this stands

Everything hangs on one phone call. TASK:#3 is the only thing in the way —
until the building manager says whether the wall is structural, quote 3 is
either the cheap answer or the expensive mistake.

Then, in order:

- TASK:#4, which cannot be ordered before the wall is decided, because the
  counter is cut to it
- TASK:#5, the weekend before they start

TASK:#1 is in, all three of them, and TASK:#2 is done — 2.34m, not the 2.4m
the first quote assumed.`,
	['home'],
	iso(dayAt(3))
);
inNotebook('diary_entries', 'seq', KITCHEN_NOTE_SEQ, kitchen);

/*
 * A year's worth of goals, most of them finished.
 *
 * Every other goal here is open or nearly so, which shows the bars and not
 * what the room is actually for: looking back at a year and seeing that ten
 * of the twelve things happened. It also fills the "closed" view, which was
 * two rows.
 */
const twelve = notebook(
	'Twelve in a year',
	'Twelve things I said I would do this year. Ten of them are done.'
);

const DONE_THIS_YEAR = [
	['learn to make sourdough', 'the third loaf was the one'],
	['swim a kilometre without stopping', 'August, badly, but without stopping'],
	['grow something edible on the balcony', 'tomatoes, basil, one unhappy pepper'],
	['see the family in Curitiba twice', 'March and July'],
	['get the bike fixed and ride it every week', 'new back wheel, and it has stuck'],
	['go a whole month without ordering food in', 'June. Cooked every night of it'],
	['learn ten songs by heart', 'eleven, if the short one counts'],
	['empty the paperwork drawer', 'two bags of shredding and a folder that fits'],
	['write to three people I had lost touch with', 'two of them wrote back'],
	['stop working after ten on weeknights', 'not every night, but it is the habit now']
];

for (const [title, outcome] of DONE_THIS_YEAR) {
	goal(title, 'year', yearStart, { status: 'achieved', outcome });
	inNotebook('goals', 'title', title, twelve);
}

goal('take the boat licence', 'year', yearStart, {
	notes: 'theory first, then the practical weekend',
	measures: [{ target: 24, current: 15, unit: 'theory hours' }]
});
inNotebook('goals', 'title', 'take the boat licence', twelve);

goal('finish the balcony shelves', 'year', yearStart, {
	notes: 'wood is bought and sitting in the hall',
	measures: [{ target: 3, current: 1, unit: 'shelves' }]
});
inNotebook('goals', 'title', 'finish the balcony shelves', twelve);

todo('book the boat theory weekend', { urgency: 3, interest: 5, sortOrder: 13 });
todo('buy the shelf brackets', { urgency: 2, interest: 2, sortOrder: 14 });
todo('cut the shelves to length', { urgency: 1, interest: 3, sortOrder: 15 });
inNotebook('todo_tasks', 'title', 'book the boat theory weekend', twelve);
inNotebook('todo_tasks', 'title', 'buy the shelf brackets', twelve);
inNotebook('todo_tasks', 'title', 'cut the shelves to length', twelve);

diary(
	TWELVE_NOTE_SEQ,
	`## The list, in October

Ten down, two to go, and the two left are the two that need a whole Saturday
rather than twenty minutes — which is the lesson, really. The ones that got
done were the ones that fitted into a week.

What I would do differently: the paperwork drawer took an afternoon and sat on
the list for seven months. Anything that can be finished in an afternoon
should not be a goal at all.

**What is left**, which is three Saturdays at most: TASK:#1, then TASK:#2 and
TASK:#3 on the same day — the wood is already in the hall and has been since
July.`,
	['living'],
	iso(dayAt(6)),
	{ pinned: true }
);
inNotebook('diary_entries', 'seq', TWELVE_NOTE_SEQ, twelve);

// Somebody who has been here two months has written up most of their weeks.
const REVIEWS = [
	[
		4,
		[
			'Kept the mornings four days out of five.',
			'Lost Wednesday to the plumber.',
			'Move admin off the afternoon block — it never survives.'
		]
	],
	[5, ['Cooked six nights. The meal plan is doing the work.', 'Reading fell over completely.']],
	[
		6,
		[
			'Best week so far — nothing moved.',
			'Two evenings back on the gym.',
			'Keep the 18:00 slot, it is the only one that sticks.'
		]
	],
	[7, ['Travel week, so most of it did not happen and that was the plan.', 'Wrote nothing. Fine.']],
	[8, ['Back to it. Slow start, better by Thursday.', 'The trip notes were worth keeping.']]
];
for (const [weeksAgo, lines] of REVIEWS) {
	lines.forEach((line, i) => reviewLine(mondayBefore(weeksAgo), i + 1, line));
}

// Things finished, at the time they were finished. Without these the todo list
// has only what is still open, which makes it look like nothing ever gets done.
const FINISHED = [
	['ring the building manager about the pipes', 6],
	['book the Évora train', 11],
	['return the drill', 15],
	['pick a paint for the hallway', 19],
	['cancel the old gym membership', 24],
	['back up the photos off the phone', 31],
	['sort out the standing desk cable mess', 38],
	['find a dentist that answers the phone', 46],
	['read the tenancy agreement properly', 52]
];
for (const [title, daysAgo] of FINISHED) {
	const id = todo(title, { status: 'done', sortOrder: 9500 });
	const when = `${iso(dayAt(daysAgo))} 18:00:00`;
	db.prepare('update todo_tasks set status = ?, completed = 1, updated_at = ? where id = ?').run(
		'done',
		when,
		id
	);
}

console.log(`  ${HISTORY_WEEKS} weeks of history: ${kept} blocks kept`);

console.log(`seeded synthetic data for ${user.email ?? uid}`);
