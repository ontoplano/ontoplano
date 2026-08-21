import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { getStreamBySlug } from '$lib/server/services/streams';

/**
 * Weight used to be read straight off a SQLite file belonging to a different
 * application, at a hardcoded absolute path, unscoped by user — so every
 * registered account saw one person's body-weight history, and the page only
 * worked on one machine.
 *
 * The plugin platform already solves this properly: a producer pushes readings
 * over the API into a per-user data stream. So this route no longer reads
 * anything itself; it points at the stream, and explains how to fill it when
 * there is none.
 */
const WEIGHT_STREAM_SLUG = 'a-private-plugin.weight';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	const stream = getStreamBySlug(ctx, WEIGHT_STREAM_SLUG);

	if (stream) redirect(302, `/data/${WEIGHT_STREAM_SLUG}`);

	return { slug: WEIGHT_STREAM_SLUG };
};
