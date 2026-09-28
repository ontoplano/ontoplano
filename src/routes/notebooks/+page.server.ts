import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { contentsOf, listNotebooks, listOrphanedNotes } from '$lib/services/notebooks';
import { getPanelWidth, getUserSetting, NOTEBOOK_PANEL_WIDTH_KEY } from '$lib/services/settings';
import { tagsInNotebook } from '$lib/services/tags';
import { notebookActions } from './actions';
import { notebookPanelData } from './panel-data';

/** The query value that stands for the orphaned notes rather than a notebook. */
const ORPHANED = 'orphaned';

export const load = async ({ locals, url }: IsolatedEvent) => {
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
		// The folders are drawn from this on the page — see `$lib/notebook-path`.
		notebooks,
		selected,
		orphaned,
		orphanedSelected: wantsOrphaned || (selected === null && orphaned.length > 0),
		contents: selected ? contentsOf(ctx, selected) : null,
		// The labels on what is filed in whichever notebook is showing.
		notebookTags: selected ? tagsInNotebook(ctx.userId, selected) : [],
		...notebookPanelData(ctx, selected),
		// Where this reader dragged the divider between the list and the panel.
		listPanelRem: getPanelWidth(ctx.userId, NOTEBOOK_PANEL_WIDTH_KEY),
		// Whether they ever did: until then the shelf grows with a wide screen.
		listPanelSet: getUserSetting(ctx.userId, NOTEBOOK_PANEL_WIDTH_KEY) !== null
	};
};

export const actions = notebookActions;
