import { SECTION_COLORS } from '$lib/colors';
import type { IconName } from '$lib/components/Icon.svelte';
import type { HideableSection } from '$lib/sections';

/**
 * The four things worth writing down before they evaporate.
 *
 * Shared rather than owned by one component, because the same four are a row
 * of tiles on the dashboard, an inline row in the header and the wedges of the
 * capture pie. Three renderings, one list — which is the only way they stay
 * the same four.
 */
export type Capture = {
	key: string;
	/** The keystroke that opens it, shown in the label where there is a keyboard. */
	shortcut: string;
	label: string;
	icon: IconName;
	/** Its colour in the pie: the section the thing ends up in. */
	color: string;
	action: string;
	/** The section this writes into. A hidden section takes its wedge with it. */
	hide?: HideableSection;
};

export const CAPTURES: Capture[] = [
	{
		key: 'idea',
		shortcut: 'i',
		label: 'Idea',
		icon: 'ideas',
		color: SECTION_COLORS.ideas,
		action: '/ideas?/create',
		hide: 'ideas'
	},
	{
		key: 'todo',
		shortcut: 't',
		label: 'To-do',
		icon: 'check',
		color: SECTION_COLORS.planner,
		action: '/tasks/todo?/create'
	},
	{
		key: 'note',
		shortcut: 'd',
		label: 'Note',
		icon: 'diary',
		color: SECTION_COLORS.diary,
		action: '/notebooks/diary?/create',
		hide: 'diary'
	},
	{
		key: 'buy',
		shortcut: 'b',
		label: 'Buy',
		icon: 'shopping',
		color: SECTION_COLORS.inventory,
		action: '/inventory/list?/create',
		hide: 'inventory'
	}
];

/** The captures left once an account's hidden sections are taken out. */
export function visibleCaptures(hidden: readonly string[]): Capture[] {
	return CAPTURES.filter((c) => !c.hide || !hidden.includes(c.hide));
}

export function captureByShortcut(key: string): Capture | undefined {
	return CAPTURES.find((c) => c.shortcut === key);
}
