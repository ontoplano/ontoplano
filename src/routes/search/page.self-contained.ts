import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { buildCtx } from '$lib/services/ctx';
import { grouped, search } from '$lib/services/search';

export const load = async ({ locals, url }: SelfContainedEvent) => {
	const q = url.searchParams.get('q') ?? '';
	const ctx = buildCtx(locals.user!.id);

	return { q, groups: grouped(search(ctx, q)) };
};
