import type { Ctx } from './ctx.js';

/**
 * Time, in the two shapes this app actually has.
 *
 * **Instants** — `created_at`, `updated_at`, `completed_at`, and friends — are
 * moments that happened. They are stored as UTC ISO-8601 with a trailing `Z`,
 * so a reader in any zone can render them correctly and two rows can be
 * compared without knowing where either was written.
 *
 * **Wall-clock values** — `task_records.scheduled_at`, `recurring_tasks.
 * start_time` — are not instants. "Gym at 18:00 on Thursday" means six in the
 * evening wherever you are, not a fixed point on the timeline, and converting
 * it to UTC would move it when you travel. They stay naive and are resolved
 * against `ctx.tz` at the moment a comparison needs a real instant.
 *
 * Getting these two confused is finding S7: everything used to be the server's
 * local time, which was right for exactly one person.
 */

/** The timestamp services write into instant columns. */
export function stamp(ctx: Ctx): string {
	return ctx.now.toISOString();
}

/** A naive `YYYY-MM-DDTHH:MM(:SS)` in this timezone, as a real instant. */
export function instantOfLocal(local: string, tz: string): Date {
	const naive = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
	if (Number.isNaN(naive.getTime())) return new Date(NaN);

	// Two passes: the offset that applies depends on the instant, and the first
	// guess is what tells us which side of a DST change we landed on.
	let guess = naive.getTime() - offsetAt(naive, tz);
	guess = naive.getTime() - offsetAt(new Date(guess), tz);
	return new Date(guess);
}

/** How far ahead of UTC `tz` is at this instant, in milliseconds. */
export function offsetAt(instant: Date, tz: string): number {
	const parts = Object.fromEntries(
		/*
		 * A fixed locale on purpose, and one of the few places that is right.
		 *
		 * This is not a date being shown to anybody: the parts are read back as
		 * numbers to work out the zone's offset, and a locale that writes them
		 * differently — or in another calendar — breaks the arithmetic rather
		 * than translating it. Leave it alone.
		 */
		new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
			.formatToParts(instant)
			.map((p) => [p.type, p.value])
	);

	const asUTC = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		// `hour12: false` can render midnight as 24.
		Number(parts.hour) % 24,
		Number(parts.minute),
		Number(parts.second)
	);

	return asUTC - instant.getTime();
}

/** An instant as the wall-clock time it shows in this zone. */
export function localOfInstant(instant: Date, tz: string): string {
	const shifted = new Date(instant.getTime() + offsetAt(instant, tz));
	return shifted.toISOString().slice(0, 19);
}

/**
 * The timestamps an insert sets.
 *
 * The columns have SQL defaults, but `CURRENT_TIMESTAMP` writes
 * `2026-08-25 02:19:01` while application code writes ISO-8601 — two formats in
 * one column, which sorts wrong the moment both appear. Services set them, so
 * there is one shape.
 */
export function stamps(ctx: Ctx): { createdAt: string; updatedAt: string } {
	const at = stamp(ctx);
	return { createdAt: at, updatedAt: at };
}

/** For tables that record when a row appeared and never when it changed. */
export function created(ctx: Ctx): { createdAt: string } {
	return { createdAt: stamp(ctx) };
}

/**
 * A day written the way a person says it, in their language and without the year.
 *
 * "2026-10-05" is a machine's answer. Somebody reading "Rent — R$1,800.00, due
 * 2026-10-05" has to parse a date to learn something they already knew, which
 * is that rent is due next month.
 *
 * **No year, deliberately.** These sentences are about things weeks away at
 * most — a bill due, a birthday coming — and the year in them is always this
 * one or the next. Printing it spends four characters saying nothing and makes
 * the line read like a database row. The year is right in a place that shows
 * history; it is wrong in a place that shows what is about to happen.
 *
 * `en-CA` is not a locale here: the format comes from the reader's, which the
 * translator carries.
 */
export function dayInWords(day: string, locale: string): string {
	const at = new Date(`${day.slice(0, 10)}T12:00:00Z`);
	if (Number.isNaN(at.getTime())) return day;
	return at.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * A `Date` as the day it is, where it is — `2026-09-19`.
 *
 * `toISOString` is UTC, so a date built from local parts comes back as
 * yesterday for anybody west of Greenwich in the evening. Written out of the
 * local parts instead, which is what every table keyed by day holds.
 */
export function localDay(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
