import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { pastNotes } from '$lib/server/services/review';

/**
 * Every week you have written about, in one place.
 *
 * The weekly note was reachable only by navigating to the week it belonged to,
 * which is a thing nobody does — so the one running account of a year this app
 * keeps was write-only. It is writing, so it belongs where the writing is.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return { weeks: pastNotes(ctx, { limit: 200 }) };
};
