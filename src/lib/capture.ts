import type { PlainKey } from '$lib/i18n/keys';
import { SECTION_COLORS } from '$lib/colors';
import type { IconName } from '$lib/components/Icon.svelte';
import type { HideableSection } from '$lib/sections';
import { routeGlyph } from '$lib/glyphs';
import type { NotebookModule } from '$lib/notebook-modules';

/**
 * The things worth writing down before they evaporate.
 *
 * Shared rather than owned by one component, because the same list is a row
 * of tiles on the dashboard, an inline row in the header and the wedges of the
 * capture pie. Three renderings, one list — which is the only way they stay
 * the same ones.
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
	/**
	 * The room the new thing lands in, so the receipt can offer to open it.
	 *
	 * Capture writes somewhere you are not looking, and "Added to your to-dos"
	 * then left you to go and find it — which on a phone, where most quick
	 * adds happen, is the difference between writing a line and writing the
	 * thing properly. See `$lib/open-from-url`.
	 */
	room: string;
	/**
	 * The notebook tab it is filed under, so it starts only in a notebook that
	 * has one. Absent for what no notebook holds — a reminder is about a time,
	 * not a subject.
	 */
	holds?: NotebookModule;
};

/** Each wears the glyph of the place it lands in, so a capture and its room agree. */
const DECLARED: Omit<Capture, 'icon'>[] = [
	{
		key: 'idea',
		holds: 'ideas',
		room: '/notebooks/ideas',
		shortcut: 'i',
		label: 'app.idea',
		color: SECTION_COLORS.ideas,
		lead: 'content',
		into: 'your ideas',
		action: '/notebooks/ideas?/create',
		hide: 'ideas'
	},
	{
		key: 'todo',
		holds: 'tasks',
		room: '/tasks/todo',
		shortcut: 't',
		// The singular, because the dialog says "New {thing}": the tab is
		// called Tasks and one of them is a task.
		label: 'app.task',
		color: SECTION_COLORS.planner,
		lead: 'heading',
		into: 'your to-dos',
		action: '/tasks/todo?/create'
	},
	{
		key: 'note',
		holds: 'notes',
		room: '/notebooks/diary',
		shortcut: 'd',
		label: 'app.note',
		color: SECTION_COLORS.diary,
		lead: 'content',
		into: 'the diary',
		action: '/notebooks/diary?/create',
		hide: 'diary'
	},
	{
		key: 'buy',
		holds: 'inventory',
		room: '/inventory',
		shortcut: 'b',
		label: 'app.buy',
		color: SECTION_COLORS.inventory,
		lead: 'label',
		into: 'the shopping list',
		action: '/inventory?/create',
		hide: 'inventory'
	},
	{
		key: 'reminder',
		room: '/reminders',
		shortcut: 'r',
		label: 'app.reminder',
		// The room borrows the planner's colour, and so does its wedge.
		color: SECTION_COLORS.planner,
		lead: 'label',
		into: 'your reminders',
		action: '/reminders?/create'
	}
];

export const CAPTURES: Capture[] = DECLARED.map((capture) => ({
	...capture,
	icon: routeGlyph(capture.room)!
}));

/** The captures left once an account's hidden sections are taken out. */
export function visibleCaptures(hidden: readonly string[]): Capture[] {
	return CAPTURES.filter((c) => !c.hide || !hidden.includes(c.hide));
}

export function captureByShortcut(key: string): Capture | undefined {
	return CAPTURES.find((c) => c.shortcut === key);
}

/**
 * The two things the wheel takes in that are not words.
 *
 * A picture is chosen from the device; a recording is made there and then.
 * Both land in Media, so both wear its colour — at two strengths, `tint` being
 * how much of it survives the mix with white. Here rather than in the wheel so
 * that the capture settings can list them beside the four you write.
 */
export type MediaCapture = { key: string; label: PlainKey; icon: IconName; tint: number };

export const MEDIA_CAPTURES: MediaCapture[] = [
	// The glyphs of the tabs they land in.
	{ key: 'picture', label: 'app.picture', icon: routeGlyph('/media/gallery')!, tint: 100 },
	{ key: 'recording', label: 'app.recording', icon: routeGlyph('/media/audios')!, tint: 62 }
];

/** Every wedge the capture wheel can hold, in the order it draws them unless told otherwise. */
export const CAPTURE_KINDS: readonly string[] = [
	...CAPTURES.map((c) => c.key),
	...MEDIA_CAPTURES.map((m) => m.key)
];

/** A media wedge's colour: the Media room's, at its own strength. */
export function mediaColor(tint: number): string {
	return tint === 100
		? SECTION_COLORS.media
		: `color-mix(in srgb, ${SECTION_COLORS.media} ${tint}%, white)`;
}

/**
 * How a kind is drawn, wherever it is drawn — a wedge, or a row in the
 * settings that choose the wedges. `media` marks the two that are added
 * rather than written.
 */
export function captureLook(
	key: string
): { label: PlainKey; icon: IconName; color: string; media: boolean } | undefined {
	const written = CAPTURES.find((c) => c.key === key);
	if (written)
		return { label: written.label, icon: written.icon, color: written.color, media: false };
	const added = MEDIA_CAPTURES.find((m) => m.key === key);
	if (added)
		return { label: added.label, icon: added.icon, color: mediaColor(added.tint), media: true };
	return undefined;
}

/** Where the capture forms' choices come from — see `/api/capture-options`. */
export const CAPTURE_OPTIONS_URL = '/api/capture-options';

/** The one glyph for the capture wheel's own settings, wherever they are opened from. */
export const CAPTURE_SETTINGS_GLYPH: IconName = 'settings';
