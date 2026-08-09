import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { NotFoundError } from '$lib/server/services/errors';
import { getStreamBySlug, listPoints, serialisePoint } from '$lib/server/services/streams';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const ctx = buildCtx(locals.user!.id);

	const rangeDays = Number(url.searchParams.get('days') ?? 180);
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
