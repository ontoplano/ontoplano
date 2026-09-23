import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { ideaHandlers } from '$lib/services/idea-actions';
import { listIdeas, listTags } from '$lib/services/ideas';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return { ideas: listIdeas(ctx), allTags: listTags(ctx) };
};

/*
 * The room's own names for the room's own handlers.
 *
 * The same handlers answer inside a notebook under a prefix — see
 * `$lib/services/idea-actions`, which is where they live so the two screens
 * cannot mean different things by the same button.
 */
export const actions = ideaHandlers;
