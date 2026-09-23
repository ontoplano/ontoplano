import { goalHandlers } from '$lib/services/goal-actions';
import { measuredActivities } from '$lib/services/workouts';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { listActivities } from '$lib/services/activities';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { createArea, deleteArea, linkableSlots, listAreas, listGoals } from '$lib/services/goals';
import { pickableNotebooks } from '$lib/services/notebooks';
import { listTodos } from '$lib/services/todos';

export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const includeClosed = url.searchParams.get('closed') === '1';

	return {
		areas: listAreas(ctx),
		notebooks: pickableNotebooks(ctx),
		goals: listGoals(ctx, { includeClosed }),
		includeClosed,
		slots: linkableSlots(ctx),
		todos: listTodos(ctx).filter((t) => t.status !== 'done'),
		/*
		 * Every todo, done ones included, for the card's own task list. The
		 * `todos` list above deliberately hides finished ones — a linking modal
		 * offering somebody a done todo to link is offering busywork — but the
		 * list on the card is the other direction: what is already linked, and
		 * whether it happened, which needs the finished ones most of all.
		 */
		allTodos: listTodos(ctx).map((t) => ({ id: t.id, title: t.title, status: t.status })),
		activities: listActivities(ctx, { activeOnly: true }).map((a) => ({ id: a.id, name: a.name })),
		/*
		 * What the workouts have ever measured, for a goal that counts one.
		 *
		 * The words somebody has actually used — `ran`, `deadlifted` — rather
		 * than a list of every activity, because a measure is free text on a
		 * session and a goal counting a word nobody has logged would sit at
		 * zero for ever with nothing to say why.
		 */
		workoutMeasures: measuredActivities(ctx).map((m) => ({
			activity: m.activity,
			unit: m.unit
		}))
	};
};

export const actions = {
	createArea: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			createArea(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				color: formData.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteArea: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			deleteArea(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * The goal verbs themselves are shared, so a goal is made, edited, closed
	 * and deleted the same way from here and from inside a notebook — see
	 * `$lib/services/goal-actions`. Areas stay here: they are the goals room's
	 * own furniture and a notebook has no business managing them.
	 */
	create: goalHandlers.create,
	update: goalHandlers.update,
	setProgress: goalHandlers.setProgress,
	close: goalHandlers.close,
	setLinks: goalHandlers.setLinks,
	setTodoStatus: goalHandlers.setTodoStatus,
	remove: goalHandlers.remove
};
