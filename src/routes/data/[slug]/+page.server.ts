import type { IsolatedEvent } from '$lib/isolated/routes';
import { error } from '@sveltejs/kit';

import { buildCtx } from '$lib/services/ctx';
import { NotFoundError } from '$lib/services/errors';
import { getStreamBySlug, listPoints, serialisePoint } from '$lib/services/streams';

/** Half a year by default, ten years at most: a window, not an argument. */
const RANGE_DEFAULT_DAYS = 180;
const RANGE_MAX_DAYS = 3650;

export const load = async ({ locals, params, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	/*
	 * How far back to look, clamped rather than trusted.
	 *
	 * `?days=abc` and `?days=1e400` both made `new Date(NaN).toISOString()`
	 * throw — outside the try below, so a crafted link was a 500 and a client
	 * error report rather than a page with a sensible window on it.
	 */
	const asked = Number(url.searchParams.get('days') ?? RANGE_DEFAULT_DAYS);
	const rangeDays =
		Number.isFinite(asked) && asked > 0
			? Math.min(Math.floor(asked), RANGE_MAX_DAYS)
			: RANGE_DEFAULT_DAYS;
	const since = new Date(ctx.now.getTime() - rangeDays * 86400_000).toISOString();

	try {
		const stream = getStreamBySlug(ctx, params.slug)!;
		const points = listPoints(ctx, params.slug, { since, limit: 5000 });

		return {
			stream: {
				slug: stream.slug,
				name: stream.name,
				source: stream.source,
				kind: stream.kind,
				unit: stream.unit,
				display: stream.display
			},
			points: points.map(serialisePoint),
			rangeDays
		};
	} catch (e) {
		if (e instanceof NotFoundError) error(404, 'Stream not found');
		throw e;
	}
};
