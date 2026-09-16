import type { PlainKey } from '$lib/i18n/keys';
/**
 * Everywhere you can go, as data.
 *
 * The navigation, the command palette and — when it exists — the pie are three
 * renderings of this list rather than three lists that drift apart.
 */
import type { Pathname } from '$app/types';
import type { IconName } from '$lib/components/Icon.svelte';
import type { HideableSection } from '$lib/sections';

export type Destination = {
	label: PlainKey;
	/** The section it belongs to, shown after the label in a flat list. */
	group: string;
	/**
	 * A real route of this app, not a string that looks like one. `resolve()`
	 * only takes these, and typing it here means a destination pointing at a
	 * route that does not exist is a build error rather than a 404 somebody
	 * finds later.
	 */
	href: Pathname;
	icon: IconName;
	/** The preference toggle that puts this row away, if any. */
	hide?: HideableSection;
};

export const DESTINATIONS: Destination[] = [
	{ label: 'app.today', group: '', href: '/', icon: 'home' },

	{ label: 'app.plan', group: 'Tasks', href: '/tasks/plan', icon: 'planner' },
	{ label: 'app.board', group: 'Tasks', href: '/tasks/board', icon: 'planner' },
	{ label: 'app.toDo', group: 'Tasks', href: '/tasks/todo', icon: 'check' },
	{ label: 'app.activities', group: 'Tasks', href: '/tasks/activities', icon: 'tag' },
	{ label: 'app.review', group: 'Tasks', href: '/tasks/review', icon: 'check' },

	{ label: 'app.goals', group: '', href: '/goals', icon: 'goals', hide: 'goals' },

	{
		label: 'app.notebooks',
		group: 'Notebooks',
		href: '/notebooks',
		icon: 'notebook',
		hide: 'notebooks'
	},
	{
		label: 'app.diary',
		group: 'Notebooks',
		href: '/notebooks/diary',
		icon: 'diary',
		hide: 'diary'
	},
	{
		label: 'app.people',
		group: 'Notebooks',
		href: '/notebooks/people',
		icon: 'user',
		hide: 'people'
	},
	{ label: 'app.ideas', group: 'Writing', href: '/notebooks/ideas', icon: 'ideas', hide: 'ideas' },

	{ label: 'app.habits', group: 'Health', href: '/health/habits', icon: 'health', hide: 'health' },

	{
		label: 'app.inventory',
		group: 'Inventory',
		href: '/inventory',
		icon: 'shopping',
		hide: 'inventory'
	},
	{
		label: 'app.recipes',
		group: 'Health',
		href: '/health/recipes',
		icon: 'shopping',
		hide: 'recipes'
	},

	{ label: 'app.account', group: 'Settings', href: '/settings/account', icon: 'settings' },
	{ label: 'app.preferences', group: 'Settings', href: '/settings/preferences', icon: 'settings' },
	{ label: 'app.integrations', group: 'Settings', href: '/settings/integrations', icon: 'plug' }
];

/**
 * Subsequence matching, the way every palette works: `pltd` finds "Planner
 * todo". Returns a score so an exact prefix beats a scattered match.
 */
export function matchScore(haystack: string, needle: string): number | null {
	if (!needle) return 0;

	const h = haystack.toLowerCase();
	const n = needle.toLowerCase();
	if (h.startsWith(n)) return 1000 - h.length;
	if (h.includes(n)) return 500 - h.indexOf(n);

	let at = -1;
	let gaps = 0;
	for (const char of n) {
		const found = h.indexOf(char, at + 1);
		if (found === -1) return null;
		gaps += found - at - 1;
		at = found;
	}
	return 100 - gaps;
}

export function findDestinations(query: string, hidden: readonly string[] = []): Destination[] {
	return DESTINATIONS.filter((d) => !d.hide || !hidden.includes(d.hide))
		.map((d) => ({ d, score: matchScore(`${d.group} ${d.label}`.trim(), query) }))
		.filter((r): r is { d: Destination; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.d);
}
