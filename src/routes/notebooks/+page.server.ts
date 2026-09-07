import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { contentsOf, listNotebooks, listOrphanedNotes } from '$lib/server/services/notebooks';
import { listPeople } from '$lib/server/services/people';
import { notebookActions } from './actions';

/** The query value that stands for the orphaned notes rather than a notebook. */
const ORPHANED = 'orphaned';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const asked = url.searchParams.get('notebook');
	const notebooks = listNotebooks(ctx);
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
		selected,
		orphaned,
		orphanedSelected: wantsOrphaned || (selected === null && orphaned.length > 0),
		contents: selected ? contentsOf(ctx, selected) : null,
		// For the People field on a note, which completes rather than duplicates.
		allPeople: listPeople(ctx)
	};
};

export const actions = notebookActions;
