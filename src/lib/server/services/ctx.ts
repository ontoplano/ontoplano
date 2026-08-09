/**
 * The single argument every service function takes.
 *
 * Built once per request and passed down. Services never reach for `locals`,
 * `new Date()`, or the session — everything they need is here, which is what
 * makes them callable from a form action, a JSON endpoint, a CLI script, or a
 * test with equal ease.
 */
export interface Ctx {
	userId: string;
	/** IANA timezone name. Until per-user timezones land, this is the server's. */
	tz: string;
	/** Injected so date logic is testable and doesn't drift mid-request. */
	now: Date;
}

/** The server's timezone — the fallback until per-user timezones exist (S7). */
export function serverTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function buildCtx(userId: string, opts: { tz?: string; now?: Date } = {}): Ctx {
	return {
		userId,
		tz: opts.tz ?? serverTimezone(),
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
