import type { PlainKey } from '$lib/i18n/keys';
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
	label: PlainKey;
	icon: IconName;
	/** Its colour in the pie: the section the thing ends up in. */
	color: string;
	action: string;
	/**
	 * The field carrying the thing itself, so a receipt can quote it.
	 *
	 * Capture writes somewhere you are not looking — that is the whole point of
	 * it — so "saved" on its own leaves you to go and check. The four forms name
	 * their lead field differently, and this is where that is known rather than
	 * in whatever component happens to be reading the form.
	 */
	lead: string;
	/**
	 * Where it ended up, as the end of the sentence "Added to …".
	 *
	 * Not the label: the label names the thing you are writing ("Idea"), and
	 * this names the place it went ("your ideas"), which is the part somebody
	 * who is on the dashboard cannot see for themselves.
	 */
	into: string;
	/** The section this writes into. A hidden section takes its wedge with it. */
	hide?: HideableSection;
};

export const CAPTURES: Capture[] = [
	{
		key: 'idea',
		shortcut: 'i',
		label: 'app.idea',
		icon: 'ideas',
		color: SECTION_COLORS.ideas,
		lead: 'content',
		into: 'your ideas',
		action: '/notebooks/ideas?/create',
		hide: 'ideas'
	},
	{
		key: 'todo',
		shortcut: 't',
		label: 'app.toDo',
		icon: 'check',
		color: SECTION_COLORS.planner,
		lead: 'heading',
		into: 'your to-dos',
		action: '/tasks/todo?/create'
	},
	{
		key: 'note',
		shortcut: 'd',
		label: 'app.note',
		icon: 'diary',
		color: SECTION_COLORS.diary,
		lead: 'content',
		into: 'the diary',
		action: '/notebooks/diary?/create',
		hide: 'diary'
	},
	{
		key: 'buy',
		shortcut: 'b',
		label: 'app.buy',
		icon: 'shopping',
		color: SECTION_COLORS.inventory,
		lead: 'label',
		into: 'the shopping list',
		action: '/inventory?/create',
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
