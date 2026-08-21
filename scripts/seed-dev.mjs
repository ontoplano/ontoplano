/**
 * Synthetic development data.
 *
 * The container never has access to the real database, so any feature that
 * needs plausible content to look at gets it from here. Everything this writes
 * is invented; nothing is derived from real user data.
 *
 * Usage:
 *   node scripts/seed-dev.mjs <path-to-dev.db>
 *
 * Expects the schema to be pushed already (`yarn db:push`) and at least one
 * registered user to exist — it seeds against the first user it finds.
 */
import Database from 'better-sqlite3';

const path = process.argv[2];
if (!path) {
	console.error('usage: node scripts/seed-dev.mjs <path-to-dev.db>');
	process.exit(1);
}

const db = new Database(path);

const user = db.prepare('select id from user limit 1').get();
if (!user) {
	console.error('no user found — register one through /login first');
	process.exit(1);
}
const uid = user.id;

const category = (name, color) =>
	db
		.prepare('insert into categories (user_id, name, color, color_light) values (?, ?, ?, ?)')
		.run(uid, name, color, '#eeeeee').lastInsertRowid;

const activity = (name, categoryId) =>
	db
		.prepare('insert into activities (user_id, name, category_id) values (?, ?, ?)')
		.run(uid, name, categoryId).lastInsertRowid;

const slot = (weekday, startTime, durationMinutes, activityId) =>
	db
		.prepare(
			`insert into weekly_slots
			 (user_id, weekday, start_time, duration_minutes, mode, activity_id, label, meta)
			 values (?, ?, ?, ?, 'activity', ?, '', '{}')`
		)
		.run(uid, weekday, startTime, durationMinutes, activityId).lastInsertRowid;

const todo = (title) =>
	db
		.prepare('insert into planner_todos (user_id, title, notes) values (?, ?, ?)')
		.run(uid, title, '');

const duty = category('duty', '#3b82f6');
const skill = category('skill', '#a855f7');

const wakeUp = activity('wake up', duty);
const gym = activity('gym', duty);
const russian = activity('learn russian', skill);

for (let weekday = 0; weekday < 7; weekday++) slot(weekday, '07:00', 30, wakeUp);
slot(1, '18:00', 60, gym);
slot(3, '18:00', 60, gym);
slot(2, '20:00', 45, russian);

todo('call the dentist');
todo('buy running shoes');

console.log(`seeded synthetic data for user ${uid}`);
