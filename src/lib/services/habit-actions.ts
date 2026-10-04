import type { Actions } from '@sveltejs/kit';
import {
	createHabit,
	deleteHabit,
	deleteOccurrence,
	logOccurrence,
	setDayCount,
	setHabitArchived,
	toggleOccurrence,
	updateHabit,
	updateOccurrence
} from '$lib/services/habits';
import { formAction } from '$lib/services/scoped-actions';

/**
 * Everything that can be done to a habit, wherever the row is on screen.
 *
 * The Health room shows every habit; a notebook shows the ones filed under it,
 * and ticking one there has to mean the same thing. So the handlers live here
 * and both routes mount them — see `$lib/services/scoped-actions` for how the
 * notebook mounts them under a prefix, and `$lib/habit-action-names` for the
 * names the markup posts to.
 */
export const habitHandlers = {
	create: formAction((ctx, formData) => {
		createHabit(ctx, {
			name: formData.get('label'),
			description: formData.get('description'),
			type: formData.get('type'),
			scheduledDays: formData.get('scheduledDays'),
			// `has` rather than `get`: the Health room's form says nothing about
			// a notebook and must not be read as taking the habit out of one.
			...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
		});
	}),

	update: formAction((ctx, formData) => {
		updateHabit(ctx, Number(formData.get('id')), {
			name: formData.get('label'),
			description: formData.get('description'),
			type: formData.get('type'),
			scheduledDays: formData.get('scheduledDays'),
			...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
		});
	}),

	/** Put away: off the room and today's list, every logged day kept. */
	archive: formAction((ctx, formData) => {
		setHabitArchived(ctx, Number(formData.get('id')), true);
	}),

	unarchive: formAction((ctx, formData) => {
		setHabitArchived(ctx, Number(formData.get('id')), false);
	}),

	delete: formAction((ctx, formData) => {
		deleteHabit(ctx, Number(formData.get('id')));
	}),

	logOccurrence: formAction((ctx, formData) => {
		logOccurrence(ctx, {
			habitId: formData.get('habitId'),
			date: formData.get('date'),
			notes: formData.get('notes')
		});
	}),

	/** The counter on a card: the day's count, set outright once the pressing stops. */
	setDayCount: formAction((ctx, formData) => {
		setDayCount(ctx, {
			habitId: formData.get('habitId'),
			date: formData.get('date'),
			count: formData.get('count')
		});
	}),

	/** Clicking a day in the heatmap: log it, or take it back. */
	toggleOccurrence: formAction((ctx, formData) => {
		toggleOccurrence(ctx, {
			habitId: formData.get('habitId'),
			date: formData.get('date')
		});
	}),

	updateOccurrence: formAction((ctx, formData) => {
		updateOccurrence(ctx, Number(formData.get('id')), formData.get('notes'));
	}),

	deleteOccurrence: formAction((ctx, formData) => {
		deleteOccurrence(ctx, Number(formData.get('id')));
	})
} satisfies Actions;
