import type { LocalRouteEvent } from '$lib/local/routes';
import { buildCtx } from '$lib/services/ctx';
import { grouped, search } from '$lib/services/search';

export const load = async ({ locals, url }: LocalRouteEvent) => {
	const q = url.searchParams.get('q') ?? '';
	const ctx = buildCtx(locals.user!.id);

	return { q, groups: grouped(search(ctx, q)) };
};
