import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { familyUserIds } from '$lib/server/services/subscriptions';
import { NotFoundError } from '$lib/server/services/errors';
import { contentsOf, getNotebook } from '$lib/server/services/notebooks';
import { listPeople } from '$lib/server/services/people';
import { notebookActions } from '../actions';

/**
 * One notebook, with nothing else on the page.
 *
 * The index shows a notebook beside the list of them, which is the right shape
 * for moving between subjects and the wrong one for sitting inside a single
 * one. This is the same notebook with the whole width.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = buildCtx(locals.user!.id);
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');

	try {
		return {
			notebook: getNotebook(ctx, id),
			contents: contentsOf(ctx, id),
			allPeople: listPeople(ctx),
			onFamilyPlan: familyUserIds(ctx.userId).length > 1
		};
	} catch (e) {
		// Somebody else's notebook and one that does not exist answer the same
		// way, which is the whole point (I3).
		if (e instanceof NotFoundError) error(404, 'Notebook not found');
		throw e;
	}
};

export const actions = notebookActions;
