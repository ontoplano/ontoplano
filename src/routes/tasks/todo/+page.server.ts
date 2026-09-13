import type { IsolatedEvent } from '$lib/isolated/routes';
import { listActivities, listCategories } from '$lib/services/activities';
import { goalBacklinks } from '$lib/services/backlinks';
import { buildCtx } from '$lib/services/ctx';
import { pickableNotebooks } from '$lib/services/notebooks';
import { todoHandlers } from '$lib/server/todo-actions';
import { listTodos } from '$lib/services/todos';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		todos: listTodos(ctx),
		categories: listCategories(ctx),
		notebooks: pickableNotebooks(ctx),
		activities: listActivities(ctx, { activeOnly: true }),
		goalLinks: goalBacklinks(ctx)
	};
};

/*
 * There is no `remind` here.
 *
 * A todo has no time on it — that is what makes it a todo — so there is
 * nothing for a reminder to be *before*. Wanting to be reminded of one is
 * wanting it to happen at a time: give it a day and a time, which makes it a
 * block, and the block's editor takes the reminder. See `services/reminders.ts`.
 *
 * The handlers themselves are shared with the notebook pages, which show the
 * same rows for one subject — see `$lib/server/todo-actions`.
 */
export const actions = {
	create: todoHandlers.create,
	update: todoHandlers.update,
	archive: todoHandlers.archive,
	setStatus: todoHandlers.setStatus,
	schedule: todoHandlers.schedule,
	delete: todoHandlers.remove,
	delegate: todoHandlers.delegate
};
