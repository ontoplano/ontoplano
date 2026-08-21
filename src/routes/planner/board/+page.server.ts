import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { categories, exceptionalSlots, plannerTodos, taskInstances } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { generateForDate, listForDate as listOccurrences } from '$lib/server/services/instances';
import { listUnscheduled, nextSortOrder } from '$lib/server/services/todos';
import { isStatus, timingFor, type Status, type Timing } from '$lib/task-status';
import { ratingsFromForm } from '$lib/ratings';
import { toLocalISOString } from '$lib/server/week-generator';

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
function nextFreeTime(dateStr: string): string {
	const now = new Date();
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

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	const date = parseDate(event.url.searchParams.get('date'));
	const dateStr = formatDate(date);

	generateForDate(userId, date);

	const occurrences = listOccurrences(userId, date).map(
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
	const generalCards = listUnscheduled(userId).map(asCard);

	const allCategories = db
		.select({ id: categories.id, name: categories.name, color: categories.color })
		.from(categories)
		.where(eq(categories.userId, userId))
		.orderBy(categories.name)
		.all();

	return {
		date: dateStr,
		today: formatDate(new Date()),
		todayCards,
		generalCards,
		categories: allCategories
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
		const userId = locals.user!.id;
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });

		const status = target.formData.get('status')?.toString();
		if (!isStatus(status)) return fail(400, { message: 'Invalid status' });

		if (target.kind === 'instance') {
			const instance = db
				.select({ scheduledAt: taskInstances.scheduledAt })
				.from(taskInstances)
				.where(and(eq(taskInstances.id, target.id), eq(taskInstances.userId, userId)))
				.get();
			if (!instance) return fail(404, { message: 'Task not found' });

			const completedAt = status === 'done' ? toLocalISOString(new Date()) : null;
			db.update(taskInstances)
				.set({
					status,
					completedAt,
					timing: completedAt ? timingFor(instance.scheduledAt, completedAt) : null
				})
				.where(and(eq(taskInstances.id, target.id), eq(taskInstances.userId, userId)))
				.run();
		} else {
			db.update(plannerTodos)
				.set({ status, completed: status === 'done', updatedAt: toLocalISOString(new Date()) })
				.where(and(eq(plannerTodos.id, target.id), eq(plannerTodos.userId, userId)))
				.run();
		}

		return { success: true };
	},

	/**
	 * Where a card sits within its column.
	 *
	 * Only todos have a position to remember — an occurrence's place is its
	 * time of day, and letting a drag override that would put the board and the
	 * calendar into disagreement over the same task.
	 */
	reorder: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const ids = formData.getAll('todoId').map((v) => Number(v));
		if (ids.some((n) => !Number.isFinite(n) || n <= 0))
			return fail(400, { message: 'Bad ordering' });

		db.transaction((tx) => {
			ids.forEach((id, index) => {
				tx.update(plannerTodos)
					.set({ sortOrder: index, updatedAt: toLocalISOString(new Date()) })
					.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
					.run();
			});
		});

		return { success: true };
	},

	/** Dragging between the two tabs: a todo gains a day, or gives one up. */
	schedule: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });
		if (target.kind !== 'todo')
			return fail(400, { message: 'Only a todo can be moved between days that way' });

		const date = target.formData.get('scheduledDate')?.toString()?.trim() || null;
		if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { message: 'Invalid date' });

		const existing = db
			.select({ id: plannerTodos.id })
			.from(plannerTodos)
			.where(and(eq(plannerTodos.id, target.id), eq(plannerTodos.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Todo not found' });

		db.update(plannerTodos)
			.set({ scheduledDate: date, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(plannerTodos.id, target.id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
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
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const status = formData.get('status')?.toString();

		if (!id) return fail(400, { message: 'Missing id' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { message: 'Invalid date' });

		const todo = db
			.select()
			.from(plannerTodos)
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.get();
		if (!todo) return fail(404, { message: 'Todo not found' });

		// A block has to name a category or an activity. A todo need not, so fall
		// back to the user's first category rather than refusing the drag.
		const categoryId =
			todo.categoryId ??
			db
				.select({ id: categories.id })
				.from(categories)
				.where(eq(categories.userId, userId))
				.orderBy(categories.name)
				.get()?.id;

		if (!categoryId) return fail(400, { message: 'Create a category before scheduling todos' });

		const startTime = formData.get('startTime')?.toString()?.trim() || nextFreeTime(date);

		db.transaction((tx) => {
			const slot = tx
				.insert(exceptionalSlots)
				.values({
					userId,
					date,
					startTime,
					durationMinutes: 30,
					mode: 'category',
					categoryId,
					label: todo.title,
					urgency: todo.urgency,
					interest: todo.interest,
					energy: todo.energy
				})
				.returning({ id: exceptionalSlots.id })
				.get();

			tx.insert(taskInstances)
				.values({
					userId,
					exceptionalSlotId: slot.id,
					scheduledAt: `${date}T${startTime}:00`,
					status: isStatus(status) ? status : todo.status,
					// The todo's notes are the only thing a block has nowhere to put,
					// so they ride on the instance.
					notes: todo.notes ?? ''
				})
				.run();

			tx.delete(plannerTodos)
				.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
				.run();
		});

		return { success: true };
	},

	/** The reverse: a one-off goes back to being an undated todo. */
	demote: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		if (!id) return fail(400, { message: 'Missing id' });

		const instance = db
			.select({
				id: taskInstances.id,
				exceptionalSlotId: taskInstances.exceptionalSlotId,
				status: taskInstances.status,
				notes: taskInstances.notes,
				urgencyOverride: taskInstances.urgencyOverride,
				interestOverride: taskInstances.interestOverride,
				energyOverride: taskInstances.energyOverride,
				label: exceptionalSlots.label,
				categoryId: exceptionalSlots.categoryId,
				urgency: exceptionalSlots.urgency,
				interest: exceptionalSlots.interest,
				energy: exceptionalSlots.energy
			})
			.from(taskInstances)
			.innerJoin(exceptionalSlots, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.get();

		// Only one-offs can go back. A weekly block is a standing commitment, not
		// a todo that happens to have a time.
		if (!instance)
			return fail(400, { message: 'Only one-off blocks can go back to the todo list' });

		db.transaction((tx) => {
			tx.insert(plannerTodos)
				.values({
					userId,
					title: instance.label || 'Untitled',
					notes: instance.notes ?? '',
					categoryId: instance.categoryId,
					status: instance.status,
					completed: instance.status === 'done',
					sortOrder: nextSortOrder(userId),
					urgency: instance.urgencyOverride ?? instance.urgency,
					interest: instance.interestOverride ?? instance.interest,
					energy: instance.energyOverride ?? instance.energy
				})
				.run();

			// The instance goes with it, by cascade.
			tx.delete(exceptionalSlots)
				.where(
					and(
						eq(exceptionalSlots.id, instance.exceptionalSlotId!),
						eq(exceptionalSlots.userId, userId)
					)
				)
				.run();
		});

		return { success: true };
	},

	createTodo: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const title = formData.get('title')?.toString()?.trim() ?? '';
		if (!title) return fail(400, { message: 'Title is required' });

		const scheduledDate = formData.get('scheduledDate')?.toString()?.trim() || null;
		if (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate))
			return fail(400, { message: 'Invalid date' });

		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const status = formData.get('status')?.toString();

		db.insert(plannerTodos)
			.values({
				userId,
				title,
				notes: formData.get('notes')?.toString()?.trim() ?? '',
				categoryId,
				scheduledDate,
				status: isStatus(status) ? status : 'todo',
				sortOrder: nextSortOrder(userId),
				...ratingsFromForm(formData)
			})
			.run();

		return { success: true };
	},

	setRatings: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });

		const ratings = ratingsFromForm(target.formData);
		if (Object.keys(ratings).length === 0) return { success: true };

		if (target.kind === 'todo') {
			db.update(plannerTodos)
				.set({ ...ratings, updatedAt: toLocalISOString(new Date()) })
				.where(and(eq(plannerTodos.id, target.id), eq(plannerTodos.userId, userId)))
				.run();
		} else {
			// On an occurrence these are per-day overrides, leaving the block that
			// produced it — and every other day it produces — untouched.
			db.update(taskInstances)
				.set({
					urgencyOverride: ratings.urgency,
					interestOverride: ratings.interest,
					energyOverride: ratings.energy
				})
				.where(and(eq(taskInstances.id, target.id), eq(taskInstances.userId, userId)))
				.run();
		}

		return { success: true };
	},

	deleteTodo: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const target = await readTarget(request);
		if ('error' in target) return fail(400, { message: target.error });
		if (target.kind !== 'todo') return fail(400, { message: 'Only todos can be deleted here' });

		db.delete(plannerTodos)
			.where(and(eq(plannerTodos.id, target.id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
	}
};
