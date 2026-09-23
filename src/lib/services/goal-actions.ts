import type { RequestEvent } from '@sveltejs/kit';
import {
	closeGoal,
	createGoal,
	deleteGoal,
	setGoalLinks,
	setTargetProgress,
	updateGoal
} from './goals.js';
import { setTodoStatus } from './todos.js';
import { buildCtx } from './ctx.js';
import { toActionFailure } from '$lib/http-errors';

/**
 * Everything done to a goal, from wherever a goal is shown.
 *
 * It used to be one action on the goals page, which is why a notebook's "New
 * goal" was a link that took you out of the notebook you were looking at —
 * there was nowhere else the form could post to. A task made from the same
 * header had always stayed put, so the same press behaved two different ways
 * depending on which tab was showing.
 *
 * The same arrangement `todo-actions.ts` has, and for the same reason: one
 * handler, used by every route that offers the verb. Making was the first one
 * to move; the rest followed when a notebook's Goals tab turned out to be a
 * list you could look at and nothing else — no edit, no delete, no way to say
 * a goal was missed — because the verbs lived on one page rather than beside
 * the thing they act on.
 *
 * Which name each route answers to is `$lib/goal-action-names`, because a
 * notebook page already uses `update` and `delete` for the notebook itself.
 */

/** The rows of "what this goal is measured by", as the form posts them. */
export function targetsFrom(formData: FormData) {
	const ids = formData.getAll('targetId');
	const values = formData.getAll('targetValue');
	const units = formData.getAll('targetUnit');
	const wholes = formData.getAll('targetWhole');
	// Empty for a measure kept by hand, which is most of them.
	const counted = formData.getAll('targetMeasure');
	return values.map((value, i) => ({
		id: ids[i],
		value,
		unit: units[i],
		whole: wholes[i],
		measureActivity: counted[i]
	}));
}

type Event = Pick<RequestEvent, 'request'> & { locals: { user?: { id: string } | null } };

export const goalHandlers = {
	create: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			createGoal(buildCtx(locals.user!.id), {
				title: formData.get('heading'),
				horizon: formData.get('horizon'),
				notes: formData.get('notes'),
				startDate: formData.get('startDate'),
				areaId: formData.get('areaId'),
				notebookId: formData.get('notebookId'),
				parentId: formData.get('parentId'),
				targets: targetsFrom(formData)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: Event) => {
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

	setProgress: async ({ request, locals }: Event) => {
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

	/** Achieved, missed, or reopened — `close` clears the date for `open`. */
	close: async ({ request, locals }: Event) => {
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

	setLinks: async ({ request, locals }: Event) => {
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

	/*
	 * Tick a linked todo from the goal card. The card lists what counts
	 * towards the goal, and a list you can see but not tick sends you to
	 * another page for the one action the list exists for.
	 */
	setTodoStatus: async ({ request, locals }: Event) => {
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

	remove: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			deleteGoal(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
