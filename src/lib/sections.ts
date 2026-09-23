import type { Translate } from './i18n/index.js';
import type { PlainKey } from './i18n/keys.js';

/**
 * The sections a person can put away.
 *
 * Not everybody keeps a diary or tracks meals, and a navbar full of rooms you
 * never enter makes the whole app read as someone else's. Hiding a section
 * takes it out of the menus — the navbar, the pies, the palette's places, the
 * dashboard cards, the capture wedges — and nothing else: the pages still
 * answer at their URLs and the data sits untouched, so turning a section back
 * on is a toggle, not a restore.
 *
 * Home and the planner are not on this list on purpose. They are the app; an
 * account that hides the planner has hidden ontoplano.
 *
 * Each one is an id and nothing else. What it is called and the sentence that
 * says what it is for live in `messages/`, like every other word — reached
 * through `sectionLabel` and `sectionBlurb` below, which is also what makes the
 * same sentence appear in first run and in preferences without being written
 * twice and disagreeing with itself.
 */
/**
 * What can be put away, and where it sits.
 *
 * Two levels, because the menu is: a room, and the tabs inside it. Hiding
 * Health takes the whole room; hiding Recipes takes one tab and leaves
 * Workouts where it is — which is the thing this list could not express when
 * it was flat, so Recipes was listed beside Health as though they were peers.
 *
 * `parent` is the room a leaf lives in. A room has none.
 */
export const HIDEABLE_SECTIONS = [
	{ id: 'goals' },
	/*
	 * The writing room's shelves.
	 *
	 * `diary`, `people`, `notebooks` and `ideas` were listed here as though
	 * they were rooms of their own, which is what they used to be and is not
	 * where they live: all four are tabs of the Notebooks room, beside Weekly
	 * notes and Tags — and those two could not be put away at all, because
	 * nobody had added them. The room drew four of its six tabs whatever the
	 * preferences said.
	 *
	 * The room's own id is `diary`, which is a name from when the diary *was*
	 * the room — the navigation has called it Notebooks for a while and the
	 * preference underneath kept the old word. Everything else in the room
	 * hangs off it, which is what finally makes those tabs appear in
	 * preferences at all: the page draws a room's leaves, and this room had
	 * none, so five of its six shelves could not be put away from the one
	 * screen that offers it.
	 *
	 * The ids stay as they are. An account stores these words, so renaming
	 * `diary` to `notebooks` would quietly un-hide whatever somebody had put
	 * away — it wants a migration, and that is a decision rather than a
	 * tidy-up. What it costs meanwhile: the diary tab is hidden by the room's
	 * own preference rather than one of its own.
	 *
	 * `NOTEBOOK_TABS` below is what the room actually draws, and every entry in
	 * it names one of these. That is the pairing `tests/room-tabs.test.ts`
	 * holds together, so a tab added to the room arrives with a way to put it
	 * away rather than being the seventh one nobody can.
	 */
	/*
	 * The writing room's shelves. The room itself is not among them.
	 *
	 * `diary` is the room's key in the navigation and the diary tab's own id,
	 * which are the same historical word for two things — and that is why the
	 * diary had no switch of its own: hiding it meant hiding the room, so the
	 * tab could only go by taking the notebooks, the ideas and the people with
	 * it. The room is always on now, so the word is free to mean the tab, and
	 * `parent: 'diary'` reads oddly for exactly one line and is what makes the
	 * diary a shelf like the others.
	 *
	 * `notebooks` is not here either. The room is the notebooks; a Notebooks
	 * room with its notebooks put away is a room with nothing in it.
	 */
	{ id: 'diary', parent: 'diary' },
	{ id: 'ideas', parent: 'diary' },
	{ id: 'weekly', parent: 'diary' },
	{ id: 'people', parent: 'diary' },
	{ id: 'tags', parent: 'diary' },
	{ id: 'health' },
	{ id: 'finance' },
	{ id: 'inventory' },
	{ id: 'media' },
	{ id: 'audios', parent: 'media' },
	{ id: 'gallery', parent: 'media' },
	{ id: 'recipes', parent: 'health' },
	{ id: 'habits', parent: 'health' },
	{ id: 'workouts', parent: 'health' }
] as const;

/**
 * The Notebooks room's tabs, in the order it shows them.
 *
 * One list, read twice: the layout draws from it, and the test beside it
 * checks that each entry can be put away. It used to be written out in the
 * layout, where four of the six tabs quietly ignored the preference that
 * claimed to hide them — the preference existed, the screen did not consult
 * it, and nothing said so.
 */
export const NOTEBOOK_TABS = [
	{ id: 'notebooks', href: '/notebooks', label: 'rooms.notebooks.tabs.notebooks' },
	{ id: 'diary', href: '/notebooks/diary', label: 'rooms.notebooks.tabs.diary' },
	// Ideas is writing too — a line you jot and come back to — and a room of
	// its own in the bar for something that small was a room nobody entered.
	{ id: 'ideas', href: '/notebooks/ideas', label: 'rooms.notebooks.tabs.ideas' },
	// What the weekly review writes. It is writing, and it was reachable only
	// from the week it belonged to, which is a thing nobody navigates to.
	{ id: 'weekly', href: '/notebooks/weekly', label: 'rooms.notebooks.tabs.weekly' },
	{ id: 'people', href: '/notebooks/people', label: 'rooms.notebooks.tabs.people' },
	// The labels themselves. They are the account's one vocabulary rather than
	// a notebook's, and this is the room where the writing is.
	{ id: 'tags', href: '/notebooks/tags', label: 'rooms.notebooks.tabs.tags' }
] as const;

/** The planner's tabs, in the order it shows them. */
export const TASK_TABS = [
	{ href: '/tasks/plan', label: 'rooms.tasks.tabs.plan' },
	{ href: '/tasks/board', label: 'rooms.tasks.tabs.board' },
	{ href: '/tasks/todo', label: 'rooms.tasks.tabs.todo' },
	{ href: '/tasks/activities', label: 'rooms.tasks.tabs.activities' },
	{ href: '/tasks/review', label: 'rooms.tasks.tabs.review' }
] as const;

/**
 * The Health room's fixed tabs. Whatever this account measures is appended by
 * the layout — a data stream earns a tab by existing, so it cannot be listed
 * here.
 */
export const HEALTH_TABS = [
	{ id: 'habits', href: '/health/habits', label: 'rooms.health.tabs.habits' },
	{ id: 'workouts', href: '/health/workouts', label: 'rooms.health.tabs.workouts' },
	{ id: 'recipes', href: '/health/recipes', label: 'rooms.health.tabs.recipes' }
] as const;

/** The Finance room's tabs, in the order it shows them. */
export const FINANCE_TABS = [
	{ href: '/finance/ledgers', label: 'rooms.finance.tabs.ledgers' },
	// Bills had a room and nothing pointing at it, which is a room nobody
	// finds. Beside Ledgers, because a bill is money leaving on a date and
	// that is the same subject as the lines it will turn into.
	{ href: '/finance/bills', label: 'rooms.finance.tabs.bills' },
	{ href: '/finance/rules', label: 'rooms.finance.tabs.rules' },
	{ href: '/finance/insights', label: 'rooms.finance.tabs.insights' }
] as const;

/**
 * The Media room's tabs.
 *
 * Recordings first: a picture is chosen from a disk, a recording is made
 * here, so it is the one the room lands on.
 */
export const MEDIA_TABS = [
	{ id: 'audios', href: '/media/audios', label: 'rooms.media.tabs.audios' },
	{ id: 'gallery', href: '/media/gallery', label: 'rooms.media.tabs.gallery' }
] as const;

/**
 * A tab inside a room: where it goes, what it is called, and the preference
 * that puts it away when it has one.
 *
 * `id` is a `string` rather than a `HideableSection` because one tab is not
 * one — Notebooks names its own room and deliberately has no switch.
 */
export type RoomTab = {
	id?: string;
	href: string;
	label: PlainKey;
};

/**
 * What each room holds, by the key the navigation knows it as.
 *
 * The rooms' layouts draw from this, and so does the wheel — which is the
 * point: the wheel says what is behind a wedge before you go there, and a
 * second list of tab names written into it would start disagreeing with the
 * strips the same week. A room with no tabs is simply absent.
 */
export const ROOM_TABS: Record<string, readonly RoomTab[]> = {
	planner: TASK_TABS,
	diary: NOTEBOOK_TABS,
	health: HEALTH_TABS,
	finance: FINANCE_TABS,
	media: MEDIA_TABS
};

/**
 * What is inside a room, named — leaving out whatever this account put away.
 *
 * The data streams Health appends are not here: they are this account's own
 * measurements rather than the room's shape, and a wheel that named three of
 * them would be saying something different on every install.
 */
export function roomTabNames(t: Translate, room: string, hidden: readonly string[] = []): string[] {
	return (ROOM_TABS[room] ?? [])
		.filter((tab) => !(tab.id && isHidden(hidden, tab.id as HideableSection)))
		.map((tab) => t(tab.label));
}

/**
 * The rooms themselves, without the tabs inside them.
 *
 * First run asks which rooms somebody wants; asking about Habits and Workouts
 * separately from Health is a question nobody has an opinion about before
 * they have used the app. The full tree belongs in Preferences, where
 * somebody goes on purpose.
 */
export const HIDEABLE_ROOMS = HIDEABLE_SECTIONS.filter((s) => !('parent' in s));

/** A room's own tabs, in the order the room shows them. */
export function leavesOf(room: string): HideableSection[] {
	return HIDEABLE_SECTIONS.filter(
		(s): s is typeof s & { parent: string } => 'parent' in s && s.parent === room
	).map((s) => s.id as HideableSection);
}

/**
 * What a section is called, and the sentence that says what it is for.
 *
 * By key rather than by field: `sections.goals.label` and `sections.goals.blurb`
 * are in `messages/`, like every other word, and the compiler checks that each
 * id has both — add a section without them and this stops building.
 *
 * The sentence is here rather than written twice because it is needed in two
 * places that must not disagree: first run, where somebody is choosing rooms
 * they have never seen, and preferences, where they are reconsidering.
 */
export function sectionLabel(t: Translate, id: HideableSection): string {
	return t(`sections.${id}.label`);
}

/**
 * What a room is called in the navigation, which is where somebody met it.
 *
 * Not always its section's own name: the writing room's preference is `diary`
 * for historical reasons and the room has been called Notebooks for a while,
 * so first run offered a tile marked "Diary" for the room that holds the
 * notebooks, the ideas and the people. The bar is the authority on a room's
 * name; this asks it, and falls back to the section's own label for anything
 * with no place in the bar.
 */
export function roomLabel(
	t: Translate,
	id: HideableSection,
	places: { name: PlainKey; hide?: string }[]
): string {
	const place = places.find((one) => one.hide === id);
	return place ? t(place.name) : sectionLabel(t, id);
}

export function sectionBlurb(t: Translate, id: HideableSection): string {
	return t(`sections.${id}.blurb`);
}

/**
 * Whether a tab is put away — by itself, or by its room being put away.
 *
 * A room that is hidden hides what is inside it; asking about the leaf alone
 * would leave a tab strip standing inside a room nobody can reach.
 */
export function isHidden(hidden: readonly string[], id: HideableSection): boolean {
	if (hidden.includes(id)) return true;
	const leaf = HIDEABLE_SECTIONS.find((s) => s.id === id);
	const parent = leaf && 'parent' in leaf ? (leaf.parent as string) : null;
	return parent !== null && hidden.includes(parent);
}

export type HideableSection = (typeof HIDEABLE_SECTIONS)[number]['id'];

export function isHideableSection(value: string): value is HideableSection {
	return HIDEABLE_SECTIONS.some((s) => s.id === value);
}
