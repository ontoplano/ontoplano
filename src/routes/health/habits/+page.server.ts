import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { habitHandlers } from '$lib/services/habit-actions';
import { listHabits, listOccurrences, today } from '$lib/services/habits';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		habits: listHabits(ctx),
		occurrences: listOccurrences(ctx),
		today: today(ctx)
	};
};

/*
 * The room's own names for the room's own handlers.
 *
 * The same handlers answer inside a notebook under a prefix — see
 * `$lib/services/habit-actions`, which is where they live so the two screens
 * cannot mean different things by the same button.
 */
export const actions = habitHandlers;
