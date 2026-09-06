/**
 * Which cards the dashboard can show, and in what order.
 *
 * The registry is the single list of what exists; a user's layout is a stored
 * subset plus an order. Anything personal or opinionated ships off by default,
 * which is what this being other people's software requires — a new user should
 * meet a dashboard that makes sense, not one full of someone else's habits.
 */
import type { HideableSection } from '$lib/sections';

export type DashboardCardId =
	| 'todayTasks'
	| 'goals'
	| 'habits'
	| 'weekPlan'
	| 'diary'
	| 'shopping'
	| 'quote'
	| 'threeWins'
	| 'latestTodos'
	| 'ideas'
	| 'bills';

export type DashboardCard = {
	id: DashboardCardId;
	label: string;
	description: string;
	/** Whether a brand-new account sees it. */
	defaultOn: boolean;
	/** Half-width cards pair up on wide screens; full-width ones do not. */
	width: 'half' | 'full';
	/** The section this card fronts. Hiding that section takes the card too. */
	hide?: HideableSection;
};

export const DASHBOARD_CARDS: DashboardCard[] = [
	{
		id: 'todayTasks',
		label: "Today's tasks",
		description: 'What is still to do today.',
		defaultOn: true,
		width: 'half'
	},
	{
		id: 'goals',
		label: 'Goals',
		description: 'Goals whose period covers today, with progress.',
		defaultOn: true,
		width: 'half',
		hide: 'goals'
	},
	{
		id: 'habits',
		label: 'Habits',
		description: 'Current streaks.',
		defaultOn: true,
		width: 'half',
		hide: 'health'
	},
	{
		id: 'quote',
		label: 'Quote',
		description: 'One of your own quotes, the same one all day.',
		defaultOn: false,
		width: 'half'
	},
	{
		id: 'weekPlan',
		label: 'Week plan',
		description: 'The week at a glance.',
		defaultOn: true,
		width: 'full'
	},
	{
		id: 'threeWins',
		label: 'Three wins',
		description: 'Three things that went well today.',
		defaultOn: false,
		width: 'full'
	},
	{
		id: 'diary',
		label: 'Diary',
		description: 'Your most recent entry, and a box to write a new one.',
		defaultOn: true,
		width: 'full',
		hide: 'diary'
	},
	{
		id: 'latestTodos',
		label: 'Latest to-dos',
		description: 'The most recent things you wrote down, newest first.',
		defaultOn: true,
		width: 'half'
	},
	{
		id: 'ideas',
		label: 'Ideas',
		description: 'The last few ideas you had.',
		defaultOn: true,
		width: 'half',
		hide: 'ideas'
	},
	{
		id: 'bills',
		label: 'Bills',
		description: 'This month: expected, paid, and which bills are still open.',
		defaultOn: true,
		width: 'half',
		hide: 'finance'
	},
	{
		id: 'shopping',
		label: 'Shopping',
		description: 'What is left to buy.',
		defaultOn: true,
		width: 'full',
		hide: 'shopping'
	}
];

/** The cards left once an account's hidden sections are taken out. */
export function visibleCards(hidden: readonly string[]): DashboardCard[] {
	return DASHBOARD_CARDS.filter((c) => !c.hide || !hidden.includes(c.hide));
}

export const DASHBOARD_LAYOUT_KEY = 'dashboard.layout';

const ALL_IDS = DASHBOARD_CARDS.map((c) => c.id);

export function defaultLayout(): DashboardCardId[] {
	return DASHBOARD_CARDS.filter((c) => c.defaultOn).map((c) => c.id);
}

/**
 * Read a stored layout.
 *
 * Unknown ids are dropped rather than crashing the page, so removing a card
 * from the registry does not break the dashboards of people who had it.
 */
export function parseLayout(raw: string | null | undefined): DashboardCardId[] {
	if (!raw) return defaultLayout();
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return defaultLayout();
		const seen = new Set<string>();
		const out: DashboardCardId[] = [];
		for (const v of parsed) {
			if (typeof v !== 'string' || seen.has(v)) continue;
			if (!(ALL_IDS as string[]).includes(v)) continue;
			seen.add(v);
			out.push(v as DashboardCardId);
		}
		return out;
	} catch {
		return defaultLayout();
	}
}

export function serialiseLayout(ids: DashboardCardId[]): string {
	const seen = new Set<string>();
	const out: DashboardCardId[] = [];
	for (const id of ids) {
		if (!(ALL_IDS as string[]).includes(id) || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return JSON.stringify(out);
}

export function cardById(id: DashboardCardId): DashboardCard | undefined {
	return DASHBOARD_CARDS.find((c) => c.id === id);
}

/**
 * Pick the quote for a date.
 *
 * Deterministic from the date, so it holds for the whole day instead of
 * flickering on every refresh, and walks the whole list before repeating.
 */
export function quoteForDate<T>(quotes: T[], date: string): T | null {
	if (quotes.length === 0) return null;
	const days = Math.floor(Date.parse(date + 'T00:00:00Z') / 86_400_000);
	return quotes[((days % quotes.length) + quotes.length) % quotes.length];
}
