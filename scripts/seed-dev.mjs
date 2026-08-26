/**
 * Synthetic development data.
 *
 * The container never has access to the real database, so any feature that
 * needs plausible content to look at gets it from here. Everything this writes
 * is invented; nothing is derived from real user data.
 *
 * **Every feature that stores something seeds it here.** A section that is
 * empty in the dev database is a screen nobody ever sees in a used state — see
 * the rule in `AGENTS.md`.
 *
 * Usage:
 *   node scripts/seed-dev.mjs <path-to-dev.db> [email]
 *
 * Expects the schema to exist (`yarn db:migrate`) and a registered user. It
 * seeds `dev@semotina.user` when that account exists, otherwise the first user
 * it finds. Re-runnable: every write is get-or-create.
 */
import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';

const path = process.argv[2];
const wantedEmail = process.argv[3] ?? 'dev@semotina.user';

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
		'select id from weekly_slots where user_id = ? and weekday = ? and start_time = ? and activity_id = ?',
		uid,
		weekday,
		startTime,
		activityId
	);
	if (existing) return existing.id;
	return run(
		`insert into weekly_slots
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
		'select id from weekly_slots where user_id = ? and weekday = ? and start_time = ? and label = ?',
		uid,
		weekday,
		startTime,
		label
	);
	if (existing) return existing.id;
	return run(
		`insert into weekly_slots
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
		'select id from exceptional_slots where user_id = ? and date = ? and start_time = ?',
		uid,
		date,
		startTime
	);
	if (existing) return existing.id;
	return run(
		`insert into exceptional_slots
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

const todo = (title, extra = {}) => {
	const existing = one('select id from planner_todos where user_id = ? and title = ?', uid, title);
	if (existing) return existing.id;
	return run(
		`insert into planner_todos
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
const inNotebook = (table, column, value, notebookId) =>
	run(
		`update ${table} set notebook_id = ? where user_id = ? and ${column} = ?`,
		notebookId,
		uid,
		value
	);

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

const person = (name, relationship, notes = '') => {
	const existing = one('select id from people where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	return run(
		`insert into people (user_id, name, relationship, notes, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?)`,
		uid,
		name,
		relationship,
		notes,
		stamp(now),
		stamp(now)
	);
};

const mention = (entryId, personId) => {
	if (one('select id from entry_people where entry_id = ? and person_id = ?', entryId, personId))
		return;
	run(
		'insert into entry_people (user_id, entry_id, person_id) values (?, ?, ?)',
		uid,
		entryId,
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
		'select id from task_instances where user_id = ? and slot_id is ? and scheduled_at = ?',
		uid,
		slotId,
		scheduledAt
	);
	if (existing) return existing.id;
	return run(
		`insert into task_instances
		 (user_id, slot_id, exceptional_slot_id, scheduled_at, status, timing, completed_at, notes, resolved_activity_id)
		 values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid,
		slotId,
		extra.exceptionalSlotId ?? null,
		scheduledAt,
		status,
		extra.timing ?? null,
		extra.completedAt ?? null,
		extra.notes ?? '',
		extra.resolvedActivityId ?? null
	);
};

const apiToken = (name, scopes) => {
	const existing = one('select id from api_tokens where user_id = ? and name = ?', uid, name);
	if (existing) return existing.id;
	// The plaintext is never stored; a dev token is printed once, like a real one.
	const plain = `onto_${randomBytes(24).toString('hex')}`;
	const hash = createHash('sha256').update(plain).digest('hex');
	const id = run(
		`insert into api_tokens (user_id, name, token_hash, prefix, scopes, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?, ?)`,
		uid,
		name,
		hash,
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
const stream = (slug, name, kind, unit, display) => {
	const existing = one('select id from data_streams where user_id = ? and slug = ?', uid, slug);
	if (existing) return existing.id;
	return run(
		`insert into data_streams
		 (user_id, slug, name, source, kind, unit, display, config, show_on_dashboard, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)`,
		uid,
		slug,
		name,
		slug.split('.')[0],
		kind,
		unit,
		display,
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
		'https://example.invalid/a-private-plugin',
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
oneOff(iso(dayOffset(1)), '19:30', 120, personal, 'dinner with M');
oneOff(iso(dayOffset(-1)), '08:00', 60, health, 'physio');

// One occurrence of the Wednesday Russian block, dropped for a single week.
const russianSlot = one(
	'select id from weekly_slots where user_id = ? and activity_id = ? limit 1',
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
	'select id from weekly_slots where user_id = ? and activity_id = ? limit 1',
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
			timing: status === 'done' ? (back % 3 === 0 ? 'late' : 'on_time') : null,
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
	'select id from weekly_slots where user_id = ? and activity_id = ? limit 1',
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
	'Win 1: shipped the export\nWin 2: ran 8km\nWin 3: cooked instead of ordering',
	['3w'],
	iso(dayOffset(-1))
);
diary(4, 'Reading is slipping. Move it before the phone, not after.', ['reading', 'planning']);

// --- people ------------------------------------------------------------------

const ana = person('Ana', 'partner', 'anniversary in March');
const joao = person('João', 'friend', 'the one who runs');
const marina = person('Marina', 'professional', 'runs the Tuesday standup');
person('Mum', 'family');

mention(1, ana);
mention(2, joao);
mention(4, marina);

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

todo('get three quotes for the counter', { urgency: 3, interest: 2, sortOrder: 7 });
todo('measure the wall properly', { status: 'done', sortOrder: 8 });

inNotebook('planner_todos', 'title', 'get three quotes for the counter', kitchen);
inNotebook('planner_todos', 'title', 'measure the wall properly', kitchen);
inNotebook('planner_todos', 'title', 'plan the trip', portugal);
inNotebook('diary_entries', 'seq', 5, kitchen);
inNotebook('diary_entries', 'seq', 4, readingNotebook);
inNotebook('diary_entries', 'seq', 6, readingNotebook);
inNotebook('diary_entries', 'seq', 7, portugal);
inNotebook('diary_entries', 'seq', 8, leak);
inNotebook('goals', 'title', 'read twelve books', readingNotebook);

idea('A weekly review that writes itself from the tracker', ['product', 'planning'], {
	favorite: true
});
idea('Meal plan should generate the shopping list', ['product'], {
	applied: true,
	appliedNote: 'v2 in TODO.md'
});
idea('Colour the week grid by energy rather than category', ['ui']);
idea('Keyboard shortcut to jump straight to today', ['ui'], { favorite: true });

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

// --- dashboard extras ---------------------------------------------------------------

quote('Plans are worthless, but planning is everything.', 'Eisenhower');
quote('A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry');
quote('What gets measured gets managed.', 'Peter Drucker');

win(today, 1, 'cleared the inbox');
win(today, 2, 'three hours of deep work');
win(iso(dayOffset(-1)), 1, 'ran 8km');

// --- the plugin platform --------------------------------------------------------------

apiToken('a-private-plugin on the phone', 'schedule:read,streams:write');
apiToken('scratch script', 'streams:read');
apiToken('home-screen widget', 'today:read');

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
		 values (?, 'pro', 'active', 'lemonsqueezy', ?, ?, ?, ?)`,
		uid,
		stamp(dayOffset(21)),
		stamp(dayOffset(-46)),
		stamp(dayOffset(-60)),
		stamp(now)
	);
}

invite('dev-invite-open-0001', 'for my brother');
invite('dev-invite-used-0002', 'for Ana', uid);

const weight = stream('a-private-plugin.weight', 'Weight', 'measurement', 'kg', 'line_chart');
for (let back = 0; back < 30; back += 2) {
	const d = dayOffset(-back);
	point(weight, stamp(d), iso(d), Number((78 + Math.sin(back / 4) * 1.2).toFixed(1)));
}

const sleep = stream('a-private-plugin.sleep', 'Sleep', 'measurement', 'h', 'bar_chart');
for (let back = 0; back < 14; back++) {
	const d = dayOffset(-back);
	point(sleep, stamp(d), iso(d), Number((6.4 + ((back * 7) % 5) / 4).toFixed(1)));
}

manifest(
	'a-private-plugin',
	'a-private-plugin',
	'Alarms that read the plan',
	JSON.stringify(['alarm', 'remind_min'])
);

console.log(`seeded synthetic data for ${user.email ?? uid}`);
