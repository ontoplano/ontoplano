/**
 * The single argument every service function takes.
 *
 * Built once per request and passed down. Services never reach for `locals`,
 * `new Date()`, or the session — everything they need is here, which is what
 * makes them callable from a form action, a JSON endpoint, a CLI script, or a
 * test with equal ease.
 */
import { getTimezone } from './settings.js';
import { str } from './validate.js';

export interface Ctx {
	userId: string;
	/** IANA timezone name: the user's own, or the server's if they never set one. */
	tz: string;
	/** Injected so date logic is testable and doesn't drift mid-request. */
	now: Date;
}

/** The server's timezone — the fallback for an account that never named one. */
export function serverTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function buildCtx(userId: string, opts: { tz?: string; now?: Date } = {}): Ctx {
	return {
		userId,
		// The user's own zone when first run captured one; the server's until then.
		tz: opts.tz ?? getTimezone(userId) ?? serverTimezone(),
		now: opts.now ?? new Date()
	};
}

/**
 * The civil (calendar) date of an instant in a given timezone.
 *
 * Data points are stamped with this on write so that "did I weigh myself
 * today" and calendar heatmaps are plain string comparisons rather than
 * per-row timezone maths at read time.
 */
export function localDateOf(instant: Date, tz: string): string {
	// en-CA gives YYYY-MM-DD, which is what we want to store.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(instant);
}

/** `YYYY-MM-DD`, and nothing else, for a day typed or posted. */
const CIVIL_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day the person chose, or today where they are when they chose none.
 *
 * Never converted to UTC (I5): the string is kept as the civil date it is.
 * Three services each parsed this for themselves before.
 */
export function chosenDay(ctx: Ctx, value: unknown): string {
	const said = value === undefined || value === null ? '' : String(value).trim();
	if (!said) return localDateOf(ctx.now, ctx.tz);
	return str(said, 'date', { max: 10, pattern: CIVIL_DAY });
}
