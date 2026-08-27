/**
 * Everywhere you can go, as data.
 *
 * The navigation, the command palette and — when it exists — the pie are three
 * renderings of this list rather than three lists that drift apart.
 */
import type { IconName } from '$lib/components/Icon.svelte';

export type Destination = {
	label: string;
	/** The section it belongs to, shown after the label in a flat list. */
	group: string;
	href: string;
	icon: IconName;
};

export const DESTINATIONS: Destination[] = [
	{ label: 'Today', group: '', href: '/', icon: 'home' },

	{ label: 'Plan', group: 'Planner', href: '/planner/plan', icon: 'planner' },
	{ label: 'Board', group: 'Planner', href: '/planner/board', icon: 'planner' },
	{ label: 'Anytime', group: 'Planner', href: '/planner/todo', icon: 'check' },
	{ label: 'Activities', group: 'Planner', href: '/planner/activities', icon: 'tag' },
	{ label: 'History', group: 'Planner', href: '/planner/history', icon: 'clock' },

	{ label: 'Goals', group: '', href: '/goals', icon: 'goals' },

	{ label: 'Diary', group: 'Writing', href: '/diary', icon: 'diary' },
	{ label: 'Notebooks', group: 'Writing', href: '/diary/notebooks', icon: 'notebook' },
	{ label: 'People', group: 'Writing', href: '/diary/people', icon: 'user' },
	{ label: 'Ideas', group: 'Writing', href: '/ideas', icon: 'ideas' },

	{ label: 'Habits', group: 'Health', href: '/health/habits', icon: 'health' },
	{ label: 'Weight', group: 'Health', href: '/health/weight', icon: 'health' },

	{ label: 'Shopping', group: 'Kitchen', href: '/shopping', icon: 'shopping' },
	{ label: 'Recipes', group: 'Kitchen', href: '/kitchen/recipes', icon: 'shopping' },
	{ label: 'Meals', group: 'Kitchen', href: '/kitchen/meals', icon: 'calendar' },

	{ label: 'Account', group: 'Settings', href: '/settings/account', icon: 'settings' },
	{ label: 'Preferences', group: 'Settings', href: '/settings/preferences', icon: 'settings' },
	{ label: 'Integrations', group: 'Settings', href: '/settings/integrations', icon: 'plug' }
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

export function findDestinations(query: string): Destination[] {
	return DESTINATIONS.map((d) => ({ d, score: matchScore(`${d.group} ${d.label}`.trim(), query) }))
		.filter((r): r is { d: Destination; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.d);
}
