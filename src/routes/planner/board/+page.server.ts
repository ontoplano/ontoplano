import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ratingsFromForm } from '$lib/ratings';
import { isStatus, type Status, type Timing } from '$lib/task-status';
import { listCategories } from '$lib/server/services/activities';
import { buildCtx, type Ctx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	generateForDate,
	listForDate as listOccurrences,
	setInstanceRatings,
	setInstanceStatus
} from '$lib/server/services/instances';
import {
	createTodo,
	demoteInstance,
	deleteTodo,
	listUnscheduled,
	promoteTodo,
	reorderTodos,
	scheduleTodo,
	setTodoRatings,
	setTodoStatus
} from '$lib/server/services/todos';

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(param: string | null): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(param + 'T00:00:00');
		if (!isNaN(parsed.getTime())) return parsed;
	}
	return new Date();
}

/**
 * Next sensible start time on a day.
 *
 * Today gets the next half hour from now so a promoted todo lands ahead of you
 * rather than in the past; another day starts at nine.
 */
function nextFreeTime(dateStr: string, now: Date): string {
	const isToday = formatDate(now) === dateStr;
	if (!isToday) return '09:00';

	const minutes = now.getMinutes() <= 30 ? 30 : 0;
	const hour = minutes === 0 ? now.getHours() + 1 : now.getHours();
	if (hour > 23) return '23:30';
	return `${pad(hour)}:${pad(minutes)}`;
}

/**
 * A card is either an occurrence of a planned block or a todo.
 *
 * They are different rows in different tables, but on the board they are the
 * same object: something with a status, a position, and optionally three
 * ratings. The `kind` is what tells an action which table to write to.
 */
export type Card = {
	uid: string;
	kind: 'instance' | 'todo';
	id: number;
	title: string;
	notes: string;
	status: Status;
	timing: Timing | null;
	sortOrder: number;
	startTime: string | null;
	scheduledDate: string | null;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	ratings: { urgency: number | null; interest: number | null; energy: number | null };
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const date = parseDate(url.searchParams.get('date'));
	const dateStr = formatDate(date);

	generateForDate(ctx, date);

	const occurrences = listOccurrences(ctx, date).map(
		(o, i): Card => ({
			uid: `instance:${o.id}`,
			kind: 'instance',
			id: o.id,
			title: o.title,
			notes: o.notes,
			status: o.status,
			timing: o.timing,
			// A scheduled block's position is its time; the board keeps them in that
			// order rather than letting a drag pretend otherwise.
			sortOrder: i,
			startTime: o.startTime,
			scheduledDate: o.date,
			categoryId: o.categoryId,
			categoryName: o.categoryName,
			categoryColor: o.categoryColor,
			ratings: o.ratings
		})
	);

	const asCard = (t: ReturnType<typeof listUnscheduled>[number]): Card => ({
		uid: `todo:${t.id}`,
		kind: 'todo',
		id: t.id,
		title: t.title,
		notes: t.notes,
		status: t.status,
		timing: null,
		sortOrder: t.sortOrder,
		startTime: null,
		scheduledDate: t.scheduledDate,
		categoryId: t.categoryId,
		categoryName: t.categoryName,
		categoryColor: t.categoryColor,
		ratings: t.ratings
	});

	const todayCards = occurrences;
	const generalCards = listUnscheduled(ctx).map(asCard);

	return {
		date: dateStr,
		today: formatDate(ctx.now),
		todayCards,
		generalCards,
		categories: listCategories(ctx)
			.map((c) => ({ id: c.id, name: c.name, color: c.color }))
			.sort((a, b) => a.name.localeCompare(b.name))
	};
};

/** Both tables answer to the same four statuses, so one action serves both. */
async function readTarget(request: Request) {
	const formData = await request.formData();
	const kind = formData.get('kind')?.toString();
	const id = Number(formData.get('id'));
	if (kind !== 'instance' && kind !== 'todo') return { error: 'Unknown card kind' } as const;
	if (!id) return { error: 'Missing id' } as const;
	return { kind, id, formData } as const;
}

export const actions: Actions = {
	setStatus: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });

		const status = target.formData.get('status');
		try {
			if (target.kind === 'instance') setInstanceStatus(ctx, target.id, status);
			else setTodoStatus(ctx, target.id, status);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Where a card sits within its column.
	 *
	 * Only todos have a position to remember — an occurrence's place is its time
	 * of day, and letting a drag override that would put the board and the
	 * calendar into disagreement over the same task.
	 */
	reorder: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			reorderTodos(buildCtx(locals.user!.id), formData.getAll('todoId'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Dragging between the two tabs: a todo gains a day, or gives one up. */
	schedule: async ({ request, locals }) => {
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });
		if (target.kind !== 'todo')
			return fail(400, { message: 'Only a todo can be moved between days that way' });

		try {
			scheduleTodo(buildCtx(locals.user!.id), target.id, target.formData.get('scheduledDate'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Turn a todo into a real scheduled task.
	 *
	 * A todo pulled onto a day stops being a todo: it becomes a one-off block
	 * with a time, which is what makes it show up on the grid, in the tracker,
	 * and against a goal. The row moves rather than being copied, so there is
	 * never a todo and a task that are secretly the same thing.
	 */
	promote: async ({ request, locals }) => {
		const ctx: Ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const status = formData.get('status')?.toString();

		if (!id) return fail(400, { message: 'Missing id' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { message: 'Invalid date' });

		const result = promoteTodo(ctx, {
			todoId: id,
			date,
			startTime: formData.get('startTime')?.toString()?.trim() || nextFreeTime(date, ctx.now),
			status: isStatus(status) ? status : undefined
		});

		if (!result.ok) return fail(400, { message: result.message });
		return { success: true };
	},

	/** The reverse: a one-off goes back to being an undated todo. */
	demote: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			demoteInstance(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createTodo: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createTodo(buildCtx(locals.user!.id), {
				title: formData.get('title'),
				notes: formData.get('notes'),
				categoryId: formData.get('categoryId'),
				scheduledDate: formData.get('scheduledDate'),
				status: formData.get('status'),
				ratings: ratingsFromForm(formData)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setRatings: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });

		const ratings = ratingsFromForm(target.formData);
		try {
			if (target.kind === 'todo') setTodoRatings(ctx, target.id, ratings);
			else setInstanceRatings(ctx, target.id, ratings);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteTodo: async ({ request, locals }) => {
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });
		if (target.kind !== 'todo') return fail(400, { message: 'Only todos can be deleted here' });

		try {
			deleteTodo(buildCtx(locals.user!.id), target.id);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
