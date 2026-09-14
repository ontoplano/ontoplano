import type { IsolatedEvent } from '$lib/isolated/routes';
import { getHiddenSections } from '$lib/services/settings';
import { buildCtx } from '$lib/services/ctx';
import { listStreams } from '$lib/services/streams';

/**
 * The section's tabs, from what the account actually has.
 *
 * There used to be a hardcoded "Weight" tab, which promised everybody a page
 * about their body weight — a very specific thing to assume about a stranger,
 * and empty for all but one person. Weight is not a feature of this app; it is
 * one data stream that one producer happens to push. So the tabs are Habits,
 * plus whatever streams exist, and an account with none sees one tab.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const streams = listStreams(ctx);

	return {
		// What the account has put away, so the tabs can honour it — a room
		// draws its own strip, and the shell's copy does not reach in here.
		hiddenSections: getHiddenSections(ctx.userId),
		streams: streams.map((s) => ({ slug: s.slug, name: s.name }))
	};
};
