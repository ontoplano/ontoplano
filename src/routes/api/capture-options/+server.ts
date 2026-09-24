import type { IsolatedEvent } from '$lib/isolated/routes';
import { json } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { listCategories as listPlannerCategories } from '$lib/services/activities';
import { listCategories as listInventoryCategories } from '$lib/services/inventory';
import { listNotebooks } from '$lib/services/notebooks';
import { listTodos } from '$lib/services/todos';

/**
 * The choices the capture dialogs offer, fetched when one opens.
 *
 * Capture lives in the app shell, which is on every page — so putting these
 * into the layout's own load would run three queries on every request to serve
 * a dialog most visits never open. Asked for once, the first time one is
 * opened, and held for the rest of the session.
 */
export const GET = async ({ locals }: IsolatedEvent) => {
	if (!locals.user)
		return json({ categories: [], notebooks: [], inventoryCategories: [], queue: [] });

	const ctx = buildCtx(locals.user.id);
	return json({
		categories: listPlannerCategories(ctx).map((c) => ({ id: c.id, name: c.name })),
		notebooks: listNotebooks(ctx).map((n) => ({ id: n.id, title: n.title })),
		inventoryCategories: listInventoryCategories(ctx).map((c) => ({ id: c.id, name: c.name })),
		/*
		 * The queue a new task would join, as the three numbers that order it.
		 *
		 * So the capture sheet can say where what is being written down would
		 * land, the way the full editor does — which is the whole reason the
		 * three sliders are in a sheet that is otherwise one line. Ratings and
		 * the two tie-breakers, nothing else: a title is not needed to count
		 * how many come before.
		 */
		queue: listTodos(ctx)
			.filter((t) => (t.status === 'todo' || t.status === 'doing') && !t.scheduledDate)
			.map((t) => ({ ratings: t.ratings, sortOrder: t.sortOrder, createdAt: t.createdAt }))
	});
};
