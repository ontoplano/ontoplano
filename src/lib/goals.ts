/**
 * Goal horizons and the periods they live in.
 *
 * A goal is always attached to a specific period — "read 12 books" in 2026 and
 * the same words in 2027 are different goals with their own progress, not one
 * goal that silently resets. So every goal carries a `periodStart`, and this
 * module is what turns a date into the period containing it.
 */
export const HORIZONS = ['day', 'week', 'month', 'quarter', 'semester', 'year'] as const;
export type Horizon = (typeof HORIZONS)[number];

export const HORIZON_LABELS: Record<Horizon, string> = {
	day: 'Day',
	week: 'Week',
	month: 'Month',
	quarter: 'Quarter',
	semester: 'Semester',
	year: 'Year'
};

export const GOAL_STATUSES = ['open', 'achieved', 'missed', 'abandoned'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export function isHorizon(v: unknown): v is Horizon {
	return typeof v === 'string' && (HORIZONS as readonly string[]).includes(v);
}

export function isGoalStatus(v: unknown): v is GoalStatus {
	return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v);
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the week containing `d`, matching the rest of the planner. */
function mondayOf(d: Date): Date {
	const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const shift = (out.getDay() + 6) % 7;
	out.setDate(out.getDate() - shift);
	return out;
}

/** First day of the period of this horizon that contains `d`. */
export function periodStart(horizon: Horizon, d: Date): string {
	const y = d.getFullYear();
	switch (horizon) {
		case 'day':
			return formatDate(d);
		case 'week':
			return formatDate(mondayOf(d));
		case 'month':
			return `${y}-${pad(d.getMonth() + 1)}-01`;
		case 'quarter':
			return `${y}-${pad(Math.floor(d.getMonth() / 3) * 3 + 1)}-01`;
		case 'semester':
			return `${y}-${d.getMonth() < 6 ? '01' : '07'}-01`;
		case 'year':
			return `${y}-01-01`;
	}
}

/** Day after the period ends, so a range check is `start <= x < end`. */
export function periodEnd(horizon: Horizon, start: string): string {
	const d = new Date(start + 'T00:00:00');
	switch (horizon) {
		case 'day':
			d.setDate(d.getDate() + 1);
			break;
		case 'week':
			d.setDate(d.getDate() + 7);
			break;
		case 'month':
			d.setMonth(d.getMonth() + 1);
			break;
		case 'quarter':
			d.setMonth(d.getMonth() + 3);
			break;
		case 'semester':
			d.setMonth(d.getMonth() + 6);
			break;
		case 'year':
			d.setFullYear(d.getFullYear() + 1);
			break;
	}
	return formatDate(d);
}

/** How the period reads to a human: "Q3 2026", "Aug 2026", "week of 17 Aug". */
export function describePeriod(horizon: Horizon, start: string): string {
	const d = new Date(start + 'T00:00:00');
	const y = d.getFullYear();
	switch (horizon) {
		case 'day':
			return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
		case 'week':
			return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${y}`;
		case 'month':
			return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
		case 'quarter':
			return `Q${Math.floor(d.getMonth() / 3) + 1} ${y}`;
		case 'semester':
			return `${d.getMonth() < 6 ? 'H1' : 'H2'} ${y}`;
		case 'year':
			return String(y);
	}
}

/** Whether a date falls inside a goal's period. */
export function periodContains(horizon: Horizon, start: string, date: string): boolean {
	return date >= start && date < periodEnd(horizon, start);
}

/**
 * Which horizons can sit inside which.
 *
 * A quarter goal can hang off a year or a semester but not off a week; the
 * form uses this so the parent list only ever offers something a goal could
 * genuinely be part of.
 */
export function canNestUnder(child: Horizon, parent: Horizon): boolean {
	return HORIZONS.indexOf(child) < HORIZONS.indexOf(parent);
}
