import type { IsolatedEvent } from '$lib/isolated/routes';
import { error } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { host } from '$lib/services/host';
import { NotFoundError } from '$lib/services/errors';
import { contentsOf, getNotebook, moduleChoices } from '$lib/services/notebooks';
import { notebookActions } from '../actions';
import { notebookPanelData } from '../panel-data';

/**
 * One notebook, with nothing else on the page.
 *
 * The index shows a notebook beside the list of them, which is the right shape
 * for moving between subjects and the wrong one for sitting inside a single
 * one. This is the same notebook with the whole width.
 */
export const load = async ({ locals, params }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');

	try {
		return {
			notebook: getNotebook(ctx, id),
			contents: contentsOf(ctx, id),
			...notebookPanelData(ctx),
			// What the Edit dialog switches, and how much is filed under each.
			// Not in `notebookPanelData`: it is about one notebook, and the index
			// draws the panel for whichever is selected rather than for a known one.
			moduleChoices: moduleChoices(ctx, id),
			onFamilyPlan: host.familyUserIds(ctx.userId).length > 1
		};
	} catch (e) {
		// Somebody else's notebook and one that does not exist answer the same
		// way, which is the whole point (I3).
		if (e instanceof NotFoundError) error(404, 'Notebook not found');
		throw e;
	}
};

export const actions = notebookActions;
