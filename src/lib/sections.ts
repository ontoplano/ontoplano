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
		id: 'shopping',
		label: 'Shopping',
		blurb:
			'What to buy and what the cupboard already holds. Ticking things off works with no signal at all, which is what a supermarket basement is.'
	},
	{
		id: 'recipes',
		label: 'Recipes',
		blurb:
			'A recipe is a list of shopping items with amounts. Put one on a day and its ingredients land on the list — only what you have run out of.'
	}
] as const;

export type HideableSection = (typeof HIDEABLE_SECTIONS)[number]['id'];

export function isHideableSection(value: string): value is HideableSection {
	return HIDEABLE_SECTIONS.some((s) => s.id === value);
}
