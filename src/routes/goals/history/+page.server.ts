import { goalHandlers } from '$lib/services/goal-actions';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { listActivities } from '$lib/services/activities';
import { buildCtx } from '$lib/services/ctx';
import { linkableSlots, listGoals } from '$lib/services/goals';
import { listTodos } from '$lib/services/todos';

/**
 * The goals that are over — reached, missed or let go — newest first, each
 * with what happened to it on the way. The room's other tab is what is still
 * under way; this one is the record.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const closed = listGoals(ctx, { includeClosed: true })
		.filter((g) => g.status !== 'open')
		.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));

	return {
		goals: closed,
		// What the card's own fold shows as counting towards each goal.
		allTodos: listTodos(ctx).map((t) => ({ id: t.id, title: t.title, status: t.status })),
		slots: linkableSlots(ctx),
		activities: listActivities(ctx, { activeOnly: true }).map((a) => ({ id: a.id, name: a.name }))
	};
};

/* The card's own verbs, the same handlers the goals tab answers with. */
export const actions = {
	setProgress: goalHandlers.setProgress,
	close: goalHandlers.close,
	note: goalHandlers.note,
	setTodoStatus: goalHandlers.setTodoStatus,
	remove: goalHandlers.remove
};
