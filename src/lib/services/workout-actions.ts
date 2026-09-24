import type { Actions, RequestEvent } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	createWorkout,
	deleteSession,
	deleteWorkout,
	doneToday,
	logWorkout,
	scheduleWorkout,
	setArchived,
	updateSession,
	updateWorkout
} from '$lib/services/workouts';

/**
 * Everything that can be done to a workout, wherever the row is on screen.
 *
 * The Health room shows every workout; a notebook shows the ones filed under
 * its subject — a training block, a race somebody is working towards — and
 * writing a session down there has to mean the same thing. The notebook mounts
 * these under a prefix; see `$lib/module-actions`.
 *
 * The categories are not here: those are the room's own vocabulary, managed
 * where they are used everywhere rather than from inside one subject.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

/**
 * The lines of one session, as a form sends them.
 *
 * Three parallel lists rather than indexed names: a row is added and removed
 * in the browser, and `measureActivity[3]` left behind by a removed row is a
 * hole somebody has to code around. Zipped by position, and a row with no
 * activity is one that was opened and abandoned — the service drops it.
 */
function measuresFrom(form: FormData) {
	const activities = form.getAll('measureActivity');
	const amounts = form.getAll('measureAmount');
	const units = form.getAll('measureUnit');
	return activities.map((activity, index) => ({
		activity,
		amount: amounts[index] ?? null,
		unit: units[index] ?? ''
	}));
}

/**
 * What a workout declares it measures, as the workout form sends it.
 *
 * The same two lists without the amounts, under their own names, because the
 * workout form and the session form are both open in the same page and a
 * shared field name would let one post the other's rows.
 */
function declaredFrom(form: FormData) {
	const activities = form.getAll('planActivity');
	const units = form.getAll('planUnit');
	return activities.map((activity, index) => ({ activity, unit: units[index] ?? '' }));
}

export const workoutHandlers = {
	create: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			createWorkout(buildCtx(locals.user!.id), {
				title: form.get('heading'),
				categoryId: form.get('categoryId'),
				plan: form.get('plan'),
				minutes: form.get('minutes') || null,
				notes: form.get('notes'),
				measures: declaredFrom(form),
				// `has` rather than `get`: the room's form says nothing about a
				// notebook and must not be read as taking the workout out of one.
				...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			updateWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				title: form.get('heading'),
				categoryId: form.get('categoryId'),
				plan: form.get('plan'),
				minutes: form.get('minutes') || null,
				notes: form.get('notes'),
				measures: declaredFrom(form),
				...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	done: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			// Ticks today's block too, if the workout is on today's plan.
			doneToday(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Write down a session: the day, anything noted, and the lines. */
	log: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			logWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				doneOn: form.get('doneOn'),
				notes: form.get('notes'),
				measures: measuresFrom(form)
			});
			return { success: true, action: 'log' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Correct one that was written down wrong. */
	updateSession: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			updateSession(buildCtx(locals.user!.id), Number(form.get('sessionId')), {
				doneOn: form.get('doneOn'),
				notes: form.get('notes'),
				measures: measuresFrom(form)
			});
			return { success: true, action: 'updateSession' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** For one logged by accident. Its lines go with it. */
	deleteSession: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			deleteSession(buildCtx(locals.user!.id), Number(form.get('sessionId')));
			return { success: true, action: 'deleteSession' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	schedule: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			scheduleWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				date: form.get('date'),
				startTime: form.get('startTime'),
				durationMinutes: form.get('durationMinutes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	archive: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			setArchived(
				buildCtx(locals.user!.id),
				Number(form.get('id')),
				form.get('archived') === 'true'
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			deleteWorkout(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
} satisfies Actions;
