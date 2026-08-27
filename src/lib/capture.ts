import { SECTION_COLORS } from '$lib/colors';
import type { IconName } from '$lib/components/Icon.svelte';

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
	field: string;
	placeholder: string;
	multiline: boolean;
};

export const CAPTURES: Capture[] = [
	{
		key: 'idea',
		shortcut: 'i',
		label: 'Idea',
		icon: 'ideas',
		color: SECTION_COLORS.ideas,
		action: '/ideas?/create',
		field: 'content',
		placeholder: 'the thing you would otherwise forget',
		multiline: true
	},
	{
		key: 'todo',
		shortcut: 't',
		label: 'Todo',
		icon: 'check',
		color: SECTION_COLORS.planner,
		action: '/planner/todo?/create',
		field: 'title',
		placeholder: 'something to do, no date yet',
		multiline: false
	},
	{
		key: 'note',
		shortcut: 'd',
		label: 'Note',
		icon: 'diary',
		color: SECTION_COLORS.diary,
		action: '/diary?/create',
		field: 'content',
		placeholder: "what happened, or what you're thinking",
		multiline: true
	},
	{
		key: 'buy',
		shortcut: 'b',
		label: 'Buy',
		icon: 'shopping',
		color: SECTION_COLORS.shopping,
		action: '/shopping?/create',
		field: 'name',
		placeholder: 'something to pick up',
		multiline: false
	}
];

export function captureByShortcut(key: string): Capture | undefined {
	return CAPTURES.find((c) => c.shortcut === key);
}
