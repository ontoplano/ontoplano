/**
 * Where an idea card posts, on each screen that shows one.
 *
 * The same component draws the card in the Ideas room and inside a notebook,
 * and the two routes cannot use the same action names — a notebook page
 * already answers to `delete` and `update` for the notebook itself. So the
 * names are a prop rather than something the markup spells out, exactly as
 * `$lib/goal-action-names` and `$lib/todo-actions` already do.
 */
export type IdeaActionNames = {
	toggleFavorite: string;
	toggleApplied: string;
	updateAppliedNote: string;
	remove: string;
};

/** The Ideas room, where an idea is the only thing on the page. */
export const IDEA_ROOM_ACTIONS: IdeaActionNames = {
	toggleFavorite: '?/toggleFavorite',
	toggleApplied: '?/toggleApplied',
	updateAppliedNote: '?/updateAppliedNote',
	remove: '?/delete'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_IDEA_ACTIONS: IdeaActionNames = {
	toggleFavorite: '?/ideaToggleFavorite',
	toggleApplied: '?/ideaToggleApplied',
	updateAppliedNote: '?/ideaUpdateAppliedNote',
	remove: '?/ideaDelete'
};
