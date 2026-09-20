import { goalHandlers, targetsFrom } from '$lib/services/goal-actions';
import { measuredActivities } from '$lib/services/workouts';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { listActivities } from '$lib/services/activities';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	closeGoal,
	createArea,
	createGoal,
	deleteArea,
	deleteGoal,
	linkableSlots,
	listAreas,
	listGoals,
	setGoalLinks,
	setTargetProgress,
	updateGoal
} from '$lib/services/goals';
import { pickableNotebooks } from '$lib/services/notebooks';
import { listTodos, setTodoStatus } from '$lib/services/todos';

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

/*
 * The measures posted by the goal form, one row at a time.
 *
 * Each row sends its id (empty for a new one), its number and its unit, so the
 * three lists line up by position and an edited measure keeps the progress
 * already on it.
 */

export const actions = {
	/*
	 * Tick a linked todo from the goal card. The card lists what counts
	 * towards the goal, and a list you can see but not tick sends you to
	 * another page for the one action the list exists for.
	 */
	setTodoStatus: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			setTodoStatus(
				buildCtx(locals.user!.id),
				Number(formData.get('todoId')),
				String(formData.get('status'))
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

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

	// The shared one, so a goal made from a notebook is made the same way.
	create: goalHandlers.create,

	update: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			updateGoal(buildCtx(locals.user!.id), Number(formData.get('id')), {
				title: formData.get('heading'),
				notes: formData.get('notes'),
				areaId: formData.get('areaId'),
				notebookId: formData.get('notebookId'),
				targets: targetsFrom(formData),
				horizon: formData.get('horizon'),
				startDate: formData.get('startDate')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setProgress: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			setTargetProgress(
				buildCtx(locals.user!.id),
				Number(formData.get('targetId')),
				formData.get('currentValue')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	close: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			closeGoal(buildCtx(locals.user!.id), Number(formData.get('id')), {
				status: formData.get('status'),
				outcome: formData.get('outcome')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setLinks: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			setGoalLinks(buildCtx(locals.user!.id), Number(formData.get('id')), {
				slotIds: formData.getAll('slotId'),
				todoIds: formData.getAll('todoId'),
				activityIds: formData.getAll('activityId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	remove: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			deleteGoal(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
