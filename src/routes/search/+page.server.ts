import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/services/ctx';
import { grouped, search } from '$lib/services/search';

export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams.get('q') ?? '';
	const ctx = buildCtx(locals.user!.id);

	return { q, groups: grouped(search(ctx, q)) };
};
