import type { LayoutServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { listStreams } from '$lib/server/services/streams';

/**
 * The section's tabs, from what the account actually has.
 *
 * There used to be a hardcoded "Weight" tab, which promised everybody a page
 * about their body weight — a very specific thing to assume about a stranger,
 * and empty for all but one person. Weight is not a feature of this app; it is
 * one data stream that one producer happens to push. So the tabs are Habits,
 * plus whatever streams exist, and an account with none sees one tab.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const streams = listStreams(buildCtx(locals.user!.id));

	return {
		streams: streams.map((s) => ({ slug: s.slug, name: s.name }))
	};
};
