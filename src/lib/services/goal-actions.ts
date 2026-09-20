import type { RequestEvent } from '@sveltejs/kit';
import { createGoal } from './goals.js';
import { buildCtx } from './ctx.js';
import { toActionFailure } from '$lib/http-errors';

/**
 * Making a goal, from wherever a goal is made.
 *
 * It used to be one action on the goals page, which is why a notebook's "New
 * goal" was a link that took you out of the notebook you were looking at —
 * there was nowhere else the form could post to. A task made from the same
 * header had always stayed put, so the same press behaved two different ways
 * depending on which tab was showing.
 *
 * The same arrangement `todo-actions.ts` has, and for the same reason: one
 * handler, used by every route that offers the verb.
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
	}
};
