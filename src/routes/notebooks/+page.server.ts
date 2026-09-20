import { measuredActivities } from '$lib/services/workouts';
import { listAreas } from '$lib/services/goals';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { listCategories } from '$lib/services/activities';
import {
	contentsOf,
	listNotebooks,
	listOrphanedNotes,
	notebookTree,
	pickableNotebooks
} from '$lib/services/notebooks';
import { listPeople } from '$lib/services/people';
import { getPanelWidth, NOTEBOOK_PANEL_WIDTH_KEY } from '$lib/services/settings';
import { notebookActions } from './actions';

/** The query value that stands for the orphaned notes rather than a notebook. */
const ORPHANED = 'orphaned';

export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const asked = url.searchParams.get('notebook');
	const notebooks = listNotebooks(ctx);
	// The same list, as the folders it makes: a notebook called
	// `Renovation — Kitchen` belongs inside `Renovation`.
	const tree = notebookTree(ctx);
	const orphaned = listOrphanedNotes(ctx);

	// Opening the page with nothing chosen should still show something, so the
	// first notebook stands in until you pick another — or the orphaned notes,
	// if that is all there is.
	const askedId = Number(asked);
	const wantsOrphaned = asked === ORPHANED;
	const fallback = notebooks.find((n) => !n.closedAt)?.id ?? null;
	const selected = wantsOrphaned
		? null
		: Number.isFinite(askedId) && askedId > 0
			? askedId
			: fallback;

	return {
		notebooks,
		tree,
		selected,
		orphaned,
		orphanedSelected: wantsOrphaned || (selected === null && orphaned.length > 0),
		contents: selected ? contentsOf(ctx, selected) : null,
		// The Tasks tab is the to-do room looking at one subject, and its editor
		// offers the same two pickers.
		categories: listCategories(ctx),
		pickableNotebooks: pickableNotebooks(ctx),
		// For the People field on a note, which completes rather than duplicates.
		allPeople: listPeople(ctx),
		// The Goals tab writes a goal in place now, and the form offers the
		// same three pickers the goals room does.
		areas: listAreas(ctx),
		workoutMeasures: measuredActivities(ctx).map((m) => ({
			activity: m.activity,
			unit: m.unit
		})),
		// Where this reader dragged the divider between the list and the panel.
		listPanelRem: getPanelWidth(ctx.userId, NOTEBOOK_PANEL_WIDTH_KEY)
	};
};

export const actions = notebookActions;
