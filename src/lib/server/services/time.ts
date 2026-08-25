import type { Ctx } from './ctx.js';

/**
 * Time, in the two shapes this app actually has.
 *
 * **Instants** — `created_at`, `updated_at`, `completed_at`, and friends — are
 * moments that happened. They are stored as UTC ISO-8601 with a trailing `Z`,
 * so a reader in any zone can render them correctly and two rows can be
 * compared without knowing where either was written.
 *
 * **Wall-clock values** — `task_instances.scheduled_at`, `weekly_slots.
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
