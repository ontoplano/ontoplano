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
 * Each one carries the sentence that says what it is, because the same sentence
 * is needed in two places — first run, where somebody is choosing rooms they
 * have never seen, and preferences, where they are reconsidering — and a
 * description written twice is a description that disagrees with itself.
 */
/*
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
	{
		id: 'goals',
		label: 'Goals',
		blurb:
			'What you are working towards, by horizon. A block of your week can belong to a goal, so the goal knows which work actually moved it.'
	},
	{
		id: 'diary',
		label: 'Diary',
		blurb:
			'What happened, in your own words, with tags you invent as you go. Numbered, so one entry can refer to another.'
	},
	{
		id: 'people',
		label: 'People',
		blurb:
			'The people in your life, and every entry that mentions one. A person is not a tag: "everything about Ana" is a page.'
	},
	{
		id: 'notebooks',
		label: 'Notebooks',
		blurb:
			'A subject you write against with no deadline — a trip, a renovation, a book. Notes gather under it and are numbered within it.'
	},
	{
		id: 'ideas',
		label: 'Ideas',
		blurb:
			'The cheapest thing to write down: caught before it evaporates, judged later. Nobody has committed to doing any of it.'
	},
	{
		id: 'health',
		label: 'Health',
		blurb:
			'Habits with streaks, and anything with a number — weight, sleep, whatever your gadgets already measure — arriving from the apps you trust.'
	},
	{
		id: 'finance',
		label: 'Finance',
		blurb:
			'The bills you expect to pay, and what you actually paid. Not accounting — the handful of payments that land on a month, and the gap between planned and real.'
	},
	{
		id: 'inventory',
		label: 'Inventory',
		blurb:
			'What to buy, and where the things you already own live — the same rows seen twice. Ticking things off works with no signal at all, which is what a supermarket basement is.'
	},
	{
		id: 'gallery',
		label: 'Gallery',
		blurb:
			'Your pictures, kept in albums. A picture lives once however many albums hold it, and a tag cuts across all of them.'
	},
	{
		id: 'recipes',
		label: 'Recipes',
		parent: 'health',
		blurb:
			'A recipe is a list of shopping items with amounts. Put one on a day and its ingredients land on the list — only what you have run out of.'
	},
	{
		id: 'habits',
		label: 'Habits',
		parent: 'health',
		blurb: 'The daily things, with a year of them at a glance.'
	},
	{
		id: 'workouts',
		label: 'Workouts',
		parent: 'health',
		blurb: 'What you planned to do and what you actually did, in your own units.'
	}
] as const;

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
export function leavesOf(room: string): { id: HideableSection; label: string }[] {
	return HIDEABLE_SECTIONS.filter(
		(s): s is typeof s & { parent: string } => 'parent' in s && s.parent === room
	).map((s) => ({ id: s.id as HideableSection, label: s.label }));
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
