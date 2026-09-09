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
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
	if (existing) return existing.id;
	return run(
		`insert into todo_tasks
		 (user_id, title, notes, status, completed, scheduled_date, category_id, urgency, interest, energy, sort_order)
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
		extra.energy ?? null,
		extra.sortOrder ?? 0
	);
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

/** Point an already-seeded row at a notebook, by whatever identifies it here. */
const inNotebook = (table, column, value, notebookId) => {
	// The number goes with the notebook: (notebook_id, notebook_seq) is unique,
	// so carrying an old number into a new notebook collides with whatever
	// already holds it there. Cleared in the same statement that moves it.
	run(
		`update ${table} set notebook_id = ?${table === 'diary_entries' ? ', notebook_seq = null' : ''} where user_id = ? and ${column} = ?`,
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
	if (table === 'diary_entries') {
		run(
			'update diary_entries set notebook_seq = null where user_id = ? and notebook_id = ?',
			uid,
			notebookId
		);
		const inBook = db
			.prepare('select id from diary_entries where user_id = ? and notebook_id = ? order by id')
			.all(uid, notebookId);
		inBook.forEach((row, i) => {
			db.prepare('update diary_entries set notebook_seq = ? where id = ?').run(i + 1, row.id);
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

const diary = (seq, content, tags = [], forDate = null) => {
	const existing = one('select id from diary_entries where user_id = ? and seq = ?', uid, seq);
	const id =
		existing?.id ??
		run(
			'insert into diary_entries (user_id, seq, content, for_date) values (?, ?, ?, ?)',
			uid,
			seq,
			content,
			forDate
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
		'select id from shopping_categories where user_id = ? and name = ?',
		uid,
		name
	);
	if (existing) return existing.id;
	return run(
		'insert into shopping_categories (user_id, name, sort_order) values (?, ?, ?)',
		uid,
		name,
		sortOrder
	);
};

const shoppingItem = (name, type, extra = {}) => {
	const existing = one('select id from shopping_items where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		`insert into shopping_items
		 (user_id, name, type, shopping_category_id, notes, bought, bought_at, snoozed)
		 values (?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		name,
		type,
		extra.categoryId ?? null,
		extra.notes ?? '',
		extra.bought ? 1 : 0,
		extra.bought ? stamp(dayOffset(-2)) : null,
		extra.snoozed ? 1 : 0
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

const goal = (title, horizon, periodStart, extra = {}) => {
	const existing = one('select id from goals where user_id = ? and title = ?', uid, title);
	if (existing) return existing.id;
	return run(
		`insert into goals
		 (user_id, area_id, parent_id, title, notes, horizon, period_start, target_value, current_value, unit, status, outcome, closed_at)
		 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		extra.areaId ?? null,
		extra.parentId ?? null,
		title,
		extra.notes ?? '',
		horizon,
		periodStart,
		extra.target ?? null,
		extra.current ?? 0,
		extra.unit ?? '',
		extra.status ?? 'open',
		extra.outcome ?? '',
		extra.status && extra.status !== 'open' ? stamp(dayOffset(-3)) : null
	);
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

const work = category('work', '#1d4ed8', '#dbeafe');
const health = category('health', '#0f766e', '#ccfbf1');
const personal = category('personal', '#b45309', '#fef3c7');

const deepWork = activity('deep work', work);
const meetings = activity('meetings', work);
const gym = activity('gym', health);
const stretching = activity('stretching', health);
const russian = activity('learn russian', personal);
const piano = activity('piano practice', personal);
const cooking = activity('cooking', personal);

for (let weekday = 0; weekday < 5; weekday++) slot(weekday, '09:00', 180, deepWork);
slot(0, '14:00', 60, meetings);
slot(2, '14:00', 60, meetings);
slot(1, '18:00', 60, gym);
slot(3, '18:00', 60, gym);
slot(5, '10:00', 45, gym);
for (let weekday = 0; weekday < 7; weekday++) slot(weekday, '07:00', 15, stretching);
slot(2, '20:00', 45, russian);
slot(4, '20:00', 45, piano);
slot(6, '11:00', 90, cooking);
// Fortnightly, so the recurrence editor has something that is not plain weekly.
slot(4, '16:00', 60, meetings, 'weeks:2:' + monday);
// A block that names an area rather than a specific thing.
categorySlot(5, '15:00', 120, personal, 'errands');

oneOff(today, '13:00', 90, meetings, 'quarterly review');
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
	urgency: 4,
	interest: 1,
	energy: 2,
	categoryId: personal,
	sortOrder: 1
});
todo('buy running shoes', { interest: 4, energy: 2, categoryId: health, sortOrder: 2 });
todo('renew the domain', {
	urgency: 5,
	energy: 1,
	categoryId: work,
	scheduledDate: today,
	sortOrder: 3
});
todo('read the Litestream docs', { status: 'doing', categoryId: work, sortOrder: 4 });
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
	target: 12,
	current: 7,
	unit: 'books'
});
goal('run a half marathon', 'quarter', quarterStart, {
	areaId: areaHealth,
	parentId: null,
	notes: 'build up to 21km without walking',
	target: 21,
	current: 14,
	unit: 'km'
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

// --- diary, ideas ----------------------------------------------------------------

diary(1, 'Started using the planner properly. Blocked out the mornings for deep work.', [
	'planning',
	'work'
]);
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
const marina = person('Marina', 'professional', 'runs the Tuesday standup', {
	phone: '+55 11 90000-0002',
	email: 'marina@example.test'
});
const mum = person('Mum', 'family');

mention(1, ana);
mention(2, joao);
mention(4, marina);

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
	'Marina moved the standup to Tuesdays for good, so the morning block survives.',
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
mention(16, marina);
mention(17, joao);

diary(5, 'The plumber says the wall can go, but not before the pipes move.', ['home']);
diary(6, 'Finished The Dispossessed. The two timelines land better than I expected.', ['reading']);
diary(7, 'Booked the flights. Three days in Lisbon, then the train south.', ['travel']);
diary(8, 'The leak is fixed. Two weeks and a new bit of ceiling.', ['home']);

// --- notebooks ---------------------------------------------------------------

const kitchen = notebook(
	'Kitchen renovation',
	'Quotes, measurements, and whatever the plumber said last.'
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
const reading = habit('read before bed', 'good', '0,1,2,3,4', '20 minutes, paper only');
const doomscroll = habit('doomscrolling', 'bad', '', 'phone in the other room after 22:00');
const coffee = habit('coffee', 'neutral', '');

for (let back = 0; back < 40; back++) {
	const d = iso(dayOffset(-back));
	if (back % 7 !== 3) logHabit(water, d);
	if (back % 3 !== 0) logHabit(reading, d, back === 1 ? 'finished the Le Guin' : '');
	if (back % 2 === 0) logHabit(coffee, d);
}
logHabit(doomscroll, iso(dayOffset(-9)), 'an hour before bed, again');

// --- shopping ---------------------------------------------------------------------

const pantry = shoppingCategory('pantry', 0);
const fresh = shoppingCategory('fresh', 1);
const household = shoppingCategory('household', 2);

shoppingItem('coffee beans', 'replenish', { categoryId: pantry, notes: 'the dark roast' });
shoppingItem('olive oil', 'replenish', { categoryId: pantry });
shoppingItem('rice', 'replenish', { categoryId: pantry, bought: true });
shoppingItem('milk', 'replenish', { categoryId: fresh });
shoppingItem('eggs', 'replenish', { categoryId: fresh, bought: true });
shoppingItem('tomatoes', 'replenish', { categoryId: fresh });
shoppingItem('dish soap', 'replenish', { categoryId: household });
shoppingItem('lightbulbs', 'replenish', { categoryId: household, snoozed: true });
shoppingItem('a proper desk chair', 'someday', { notes: 'try one before buying' });
shoppingItem('noise-cancelling headphones', 'someday');
shoppingItem('cast iron pan', 'someday', { bought: true });

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
		extra.currency ?? 'BRL',
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
		'BRL'
	);
};

const billRent = bill('Rent', 180000, { dueDay: 5, payLeadDays: 2 });
const billPower = bill('Power', 15000, { dueDay: 12, payLeadDays: 3 });
const billWater = bill('Water', 8000, { dueDay: 12 });
const billInternet = bill('Internet', 9990, { dueDay: 20 });
const cleaner = bill('Cleaner', 12000, { rhythm: 'weekly' });
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

const filedItem = (name, locationId, attributes = null) => {
	const existing = one('select id from shopping_items where user_id = ? and name = ?', uid, name);
	const id =
		existing?.id ??
		run(
			"insert into shopping_items (user_id, name, type, bought) values (?, ?, 'someday', 1)",
			uid,
			name
		);
	run(
		'update shopping_items set location_id = ?, attributes = ? where id = ?',
		locationId,
		JSON.stringify(attributes ?? {}),
		id
	);
};

// The thing the whole feature exists to answer, and its neighbours.
filedItem('measuring tape', firstDrawer, { length: '5m', kind: 'construction' });
filedItem('spare keys', firstDrawer, { for: 'the front door' });
filedItem('sewing kit', secondDrawer, {});
filedItem('passport', secondDrawer, { expires: '2031-04' });
filedItem('board games', bookshelf, {});

filedItem('USB-C cable', deskDrawer, { plug: 'USB-C', speed: 'USB3' });
filedItem('HDMI cable', deskDrawer, { length: '2m' });
filedItem('label printer', officeLocation, { model: 'P710' });

filedItem('blender', kitchenRoom, {});
filedItem('bicarbonate of soda', pantryLoc, {});
filedItem('dish soap', underSink, {});
filedItem('spare bulbs', underSink, { fitting: 'E27', watts: '9' });

filedItem('first aid kit', cabinet, {});
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
		 values (?, 'https://example.com/ontoplano-hook', 'shopping.added,shopping.bought', ?, ?, ?)`,
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
	one('select id from shopping_categories where user_id = ? and name = ?', uid, name);

// Pantry and fresh hold food; household does not.
for (const [name, isFood] of [
	['pantry', 1],
	['fresh', 1],
	['household', 0]
]) {
	const found = shoppingCategoryNamed(name);
	if (found)
		db.prepare('update shopping_categories set is_food = ? where id = ?').run(isFood, found.id);
}

const priced = (name, cents) => {
	const item = one('select id from shopping_items where user_id = ? and name = ?', uid, name);
	if (item)
		db.prepare('update shopping_items set price_cents = ? where id = ?').run(cents, item.id);
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

const ingredient = (recipeId, itemName, quantity, unit, note = '') => {
	let item = one('select id from shopping_items where user_id = ? and name = ?', uid, itemName);
	if (!item) {
		const pantry = shoppingCategoryNamed('pantry');
		const id = run(
			`insert into shopping_items (user_id, name, type, shopping_category_id, bought)
			 values (?, ?, 'replenish', ?, 0)`,
			uid,
			itemName,
			pantry?.id ?? null
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

// --- Pictures ---------------------------------------------------------------
//
// Two of them, drawn here rather than shipped as files: a seed that carries
// binaries is a seed nobody reviews, and the point is a database with a little
// of everything in it, not a photograph.
//
// They are real pictures — three CC0 works from the Metropolitan Museum's Open
// Access collection, cropped to the shapes this app draws them in by
// `yarn demo-media`. `scripts/demo-media/SOURCES.md` says which is which.
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
	[marina, 'Marina', 'marina.jpg'],
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

const pastaPicture = picture(
	'tomato-pasta.jpg',
	'Tomatoes for the sauce',
	demoPicture('tomato-pasta.jpg')
);
if (
	pastaPicture &&
	!one(
		'select id from recipe_images where recipe_id = ? and media_id = ?',
		tomatoPasta,
		pastaPicture
	)
)
	run(
		`insert into recipe_images (user_id, recipe_id, media_id, position, is_main, created_at)
		 values (?, ?, ?, 0, 1, ?)`,
		uid,
		tomatoPasta,
		pastaPicture,
		stamp(now)
	);

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
shoppingItem('a proper armchair', 'someday', { categoryId: household });

age(
	'ideas',
	{ column: 'content', value: 'Learn to sail, properly, not just crewing for other people' },
	monthsAgo(5)
);
age('shopping_items', { column: 'name', value: 'a proper armchair' }, monthsAgo(9));

// --- What things have actually cost -----------------------------------------------
//
// Two purchases of the same thing at different prices, so the shopping list has
// a drift to show. One point says nothing; the sentence starts at two.

const pricePoint = (itemName, cents, when) => {
	const item = one('select id from shopping_items where user_id = ? and name = ?', uid, itemName);
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
	db.prepare('update shopping_items set price_cents = ? where id = ?').run(cents, item.id);
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

// Habits over the same window. A run with holes in it, because a heatmap that
// is solid says nothing and a habit nobody ever breaks is not a habit.
for (let daysAgo = 1; daysAgo <= HISTORY_WEEKS * 7; daysAgo++) {
	const date = iso(dayAt(daysAgo));
	const dow = (dayAt(daysAgo).getDay() + 6) % 7;
	if (rand() < 0.82) logHabit(water, date);
	if (dow < 5 && rand() < 0.66) logHabit(reading, date);
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

**Mornings hold.** The block before ten is the only one I never move, and it
is the only reason anything long ever gets finished.

**Afternoons are fiction.** I plan two hours of deep work at 14:00 and spend
it on mail, every time. That block should say *admin* and I should stop
pretending otherwise.

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
