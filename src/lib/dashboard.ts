import type { PlainKey } from '$lib/i18n/keys';
/**
 * Which cards the dashboard can show, and in what order.
 *
 * The registry is the single list of what exists; a user's layout is a stored
 * subset plus an order. Anything personal or opinionated ships off by default,
 * which is what this being other people's software requires — a new user should
 * meet a dashboard that makes sense, not one full of someone else's habits.
 *
 * The order here is the order a new account meets, and the order the picker
 * offers: the two cards that draw a picture of the week come first, because
 * the dashboard's job is to be read at a glance and a list of words is not
 * read at a glance.
 */
import type { SectionKey } from '$lib/colors';
import type { HideableSection } from '$lib/sections';

export type DashboardCardId =
	| 'nextDays'
	| 'weekPie'
	| 'todayTasks'
	| 'goals'
	| 'habits'
	| 'diary'
	| 'inventory'
	| 'quote'
	| 'threeWins'
	| 'latestTodos'
	| 'ideas'
	| 'bills'
	| 'workouts';

export type DashboardCard = {
	id: DashboardCardId;
	label: PlainKey;
	description: PlainKey;
	/** Whether a brand-new account sees it. */
	defaultOn: boolean;
	/** Half-width cards pair up on wide screens; full-width ones do not. */
	width: 'half' | 'full';
	/**
	 * The room this card is about.
	 *
	 * The picker groups by it, so somebody looking for "something about my
	 * money" reads one heading rather than thirteen names — and it is the same
	 * grouping the wheel and the navbar use, so the dashboard's vocabulary is
	 * the app's.
	 */
	section: SectionKey;
	/** The preference that puts it away. Absent means always there. */
	hide?: HideableSection;
};

export const DASHBOARD_CARDS: DashboardCard[] = [
	{
		id: 'nextDays',
		label: 'app.nextThreeDays',
		description: 'card.todayAndTheTwoDays',
		defaultOn: true,
		width: 'full',
		section: 'planner'
	},
	{
		id: 'weekPie',
		label: 'app.whereTheWeekWent',
		description: 'card.theHoursYouHaveTicked',
		defaultOn: true,
		width: 'half',
		section: 'planner'
	},
	{
		id: 'todayTasks',
		label: 'app.todaysTasks',
		description: 'card.whatIsStillToDo',
		defaultOn: true,
		width: 'half',
		section: 'planner'
	},
	{
		id: 'latestTodos',
		label: 'app.latestToDos',
		description: 'card.theMostRecentThingsYou',
		defaultOn: true,
		width: 'half',
		section: 'planner'
	},
	{
		id: 'goals',
		label: 'app.goals',
		description: 'card.goalsWhosePeriodCoversToday',
		defaultOn: true,
		width: 'half',
		section: 'goals',
		hide: 'goals'
	},
	{
		id: 'habits',
		label: 'app.habits',
		description: 'card.currentStreaks',
		defaultOn: true,
		width: 'half',
		section: 'health',
		hide: 'health'
	},
	{
		id: 'workouts',
		label: 'app.workouts',
		description: 'card.yourWorkoutsAndHowLong',
		defaultOn: false,
		width: 'half',
		section: 'health',
		hide: 'health'
	},
	{
		id: 'diary',
		label: 'app.diary',
		description: 'card.yourMostRecentEntryAnd',
		defaultOn: true,
		width: 'full',
		section: 'diary',
		hide: 'diary'
	},
	{
		id: 'ideas',
		label: 'app.ideas',
		description: 'card.theLastFewIdeasYou',
		defaultOn: true,
		width: 'half',
		section: 'ideas',
		hide: 'ideas'
	},
	{
		id: 'bills',
		label: 'app.bills',
		description: 'card.thisMonthExpectedPaidAnd',
		defaultOn: true,
		width: 'half',
		section: 'finance',
		hide: 'finance'
	},
	{
		id: 'inventory',
		label: 'app.shoppingList',
		description: 'card.whatIsLeftToBuy',
		defaultOn: true,
		width: 'full',
		section: 'inventory',
		hide: 'inventory'
	},
	{
		id: 'threeWins',
		label: 'app.threeWins',
		description: 'card.threeThingsThatWentWell',
		defaultOn: false,
		width: 'full',
		section: 'home'
	},
	{
		id: 'quote',
		label: 'app.quote',
		description: 'card.oneOfYourOwnQuotes',
		defaultOn: false,
		width: 'half',
		section: 'home'
	}
];

/** The cards left once an account's hidden sections are taken out. */
export function visibleCards(hidden: readonly string[]): DashboardCard[] {
	return DASHBOARD_CARDS.filter((c) => !c.hide || !hidden.includes(c.hide));
}

/** The registry, in the rooms the picker draws it in, registry order kept. */
export function cardsBySection(cards: readonly DashboardCard[]): {
	section: SectionKey;
	cards: DashboardCard[];
}[] {
	const groups = new Map<SectionKey, DashboardCard[]>();
	for (const card of cards) {
		const held = groups.get(card.section);
		if (held) held.push(card);
		else groups.set(card.section, [card]);
	}
	return [...groups].map(([section, inIt]) => ({ section, cards: inIt }));
}

export const DASHBOARD_LAYOUT_KEY = 'dashboard.layout';

/**
 * Which cards this account has ever been offered.
 *
 * A layout is the cards somebody wants, so a card missing from it means "no".
 * That is right for one they took off and wrong for one that did not exist
 * when they arranged their dashboard: a new card would otherwise ship to
 * nobody who had ever pressed Done. This is the difference between the two —
 * an id in here has been offered, so its absence from the layout is a
 * decision; an id that is not has never been seen, and a card that ships on
 * by default is folded in where the registry puts it.
 */
export const DASHBOARD_SEEN_KEY = 'dashboard.seen';

const ALL_IDS = DASHBOARD_CARDS.map((c) => c.id);

/**
 * Cards that were renamed, and what they are called now.
 *
 * An id is stored in every account that ever arranged its dashboard, so
 * renaming one without this drops the card from those dashboards and looks
 * like data loss. `weekPlan` was the seven-column timetable that is now the
 * next three days.
 */
const RENAMED: Record<string, DashboardCardId> = { weekPlan: 'nextDays' };

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
			if (typeof v !== 'string') continue;
			const id = RENAMED[v] ?? v;
			if (seen.has(id)) continue;
			if (!(ALL_IDS as string[]).includes(id)) continue;
			seen.add(id);
			out.push(id as DashboardCardId);
		}
		return out;
	} catch {
		return defaultLayout();
	}
}

/** The ids an account has already been offered, from the stored list. */
export function parseSeen(raw: string | null | undefined): DashboardCardId[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((v): v is string => typeof v === 'string')
			.map((v) => RENAMED[v] ?? v)
			.filter((v): v is DashboardCardId => (ALL_IDS as string[]).includes(v));
	} catch {
		return [];
	}
}

/**
 * A card added to the app since this account last arranged its dashboard,
 * put where the registry says it goes.
 *
 * After the nearest card above it that the layout actually has, so a new card
 * meant for the top of the page arrives at the top rather than under thirteen
 * others — and the arrangement somebody made is otherwise untouched.
 */
export function foldInNewCards(
	layout: readonly DashboardCardId[],
	seen: readonly DashboardCardId[]
): DashboardCardId[] {
	const known = new Set<string>(seen);
	const out = [...layout];

	for (const [at, card] of DASHBOARD_CARDS.entries()) {
		if (known.has(card.id) || !card.defaultOn || out.includes(card.id)) continue;

		const above = DASHBOARD_CARDS.slice(0, at)
			.map((c) => out.indexOf(c.id))
			.filter((i) => i >= 0);
		out.splice(above.length ? Math.max(...above) + 1 : 0, 0, card.id);
	}

	return out;
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

/** Everything the app can offer, which is what "has been seen" is written as. */
export function serialiseSeen(): string {
	return JSON.stringify(ALL_IDS);
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
