import type { IsolatedEvent } from '$lib/isolated/routes';
import { json } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { listCategories as listPlannerCategories } from '$lib/services/activities';
import { listCategories as listInventoryCategories } from '$lib/services/inventory';
import { pickableNotebooks } from '$lib/services/notebooks';
import { listTodos } from '$lib/services/todos';
import { reminderClock } from '$lib/services/reminders';
import { listRingtones } from '$lib/services/ringtones';

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
		return json({
			categories: [],
			notebooks: [],
			inventoryCategories: [],
			queue: [],
			reminderClock: null,
			ringtones: []
		});

	const ctx = buildCtx(locals.user.id);
	return json({
		categories: listPlannerCategories(ctx).map((c) => ({ id: c.id, name: c.name })),
		// Open ones, favourites first, each with what its forms start with.
		notebooks: pickableNotebooks(ctx),
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
			.map((t) => ({ ratings: t.ratings, sortOrder: t.sortOrder, createdAt: t.createdAt })),
		/* A reminder's time is checked against the account's clock, not the browser's. */
		reminderClock: reminderClock(ctx),
		ringtones: listRingtones(ctx).map((r) => ({ id: r.id, name: r.name }))
	});
};
