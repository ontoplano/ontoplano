import { ratingsFromForm } from '$lib/ratings';
import {
	archiveTodo,
	createTodo,
	delegateTodo,
	deleteTodo,
	batchTodos,
	isBatchVerb,
	scheduleTodo,
	setTodoAttribute,
	setTodoStatus,
	setTodoRatings,
	swapTiedTodos,
	tagTodo,
	updateTodo
} from '$lib/services/todos';
import { ValidationError } from '$lib/services/errors';
import { attributesPatchFromFormData } from '$lib/services/task-attributes';
import { formAction } from '$lib/services/scoped-actions';

/**
 * Everything that can be done to a todo, wherever the row is on screen.
 *
 * In `services` rather than `server`, where it used to be: nothing here needs
 * a server. It is form handlers over the todo service, and the to-do room is
 * one of the rooms a phone-only instance carries — so a file under
 * `$lib/server` was a route compiled into the device's worker importing from a
 * directory that must never reach it. It happened to work because this file
 * touches no Node API; the next thing added to it would not have.
 *
 * The to-do room shows every todo; a notebook shows the ones filed under it,
 * and operating on one there has to mean the same thing — tick it off, put it
 * on a day, edit it, put it away, delete it. The handlers live here so the two
 * screens run the same code rather than two copies that drift.
 *
 * They are mounted under different names on the two routes: a notebook page
 * already has a `delete` and an `update` of its own, so there they are
 * `todoDelete` and `todoUpdate`. `TODO_ACTIONS` below names them for the
 * markup, so a form never spells an action out.
 */
/**
 * `{ attributes }` when the form carried the attributes fold, nothing when it
 * did not: the board's inline editor has no fold and must not clear them.
 */
function attributesFrom(formData: FormData) {
	const attributes = attributesPatchFromFormData(formData);
	return attributes === undefined ? {} : { attributes };
}

export const todoHandlers = {
	create: formAction((ctx, formData) => {
		const made = createTodo(ctx, {
			title: formData.get('heading'),
			notes: formData.get('notes'),
			categoryId: formData.get('categoryId'),
			notebookId: formData.get('notebookId'),
			// `has` rather than `get`: a form with no tags box must leave the
			// labels alone, and one with an empty box must clear them.
			...(formData.has('tags') ? { tags: formData.get('tags') } : {}),
			scheduledDate: formData.get('scheduledDate'),
			ratings: ratingsFromForm(formData),
			...attributesFrom(formData)
		});
		/*
		 * The id comes back, so the toast can offer a way straight into the
		 * thing just made. Without it the only route to "say more about
		 * this" is finding the row again in a list that has just reordered.
		 */
		return { success: true, id: made };
	}),

	update: formAction((ctx, formData) => {
		updateTodo(ctx, Number(formData.get('id')), {
			title: formData.get('heading'),
			notes: formData.get('notes'),
			categoryId: formData.get('categoryId'),
			notebookId: formData.get('notebookId'),
			...(formData.has('tags') ? { tags: formData.get('tags') } : {}),
			ratings: ratingsFromForm(formData),
			...attributesFrom(formData)
		});
	}),

	/**
	 * One attribute changed in place — the pencil in the ⓘ dialog. An empty
	 * value removes it.
	 */
	attribute: formAction((ctx, formData) => {
		setTodoAttribute(ctx, Number(formData.get('id')), formData.get('key'), formData.get('value'));
	}),

	/*
	 * A label on or off, and nothing else touched.
	 *
	 * `update` replaces the whole row, so putting one word on a task through
	 * it means sending the title, the notes, the notebook and every other
	 * label back unchanged — which is a dialog, not a press, and is wrong for
	 * the one beside the labels themselves. The same pair the MCP tool takes,
	 * over the same service function.
	 */
	tag: formAction((ctx, formData) => {
		tagTodo(ctx, Number(formData.get('id')), {
			add: formData.get('add'),
			remove: formData.get('remove')
		});
	}),

	/*
	 * The three ratings and nothing else — pressed on a card's bars and
	 * confirmed beside them, without the whole row going back through a form.
	 */
	rate: formAction((ctx, formData) => {
		setTodoRatings(ctx, Number(formData.get('id')), ratingsFromForm(formData));
	}),

	/*
	 * Two tasks the ratings cannot tell apart, the other way round — the
	 * arrows beside a tie. See `swapTiedTodos`.
	 */
	nudge: formAction((ctx, formData) => {
		swapTiedTodos(ctx, formData.get('id'), formData.get('withId'));
	}),

	/*
	 * The same verbs, over a selection.
	 *
	 * One action rather than four, because what differs between them is one
	 * word and the fields that word reads — and a route that had to mount
	 * `batchStatus`, `batchTag`, `batchNotebook` and `batchRemove` is four
	 * names for one idea in two places each. `batchTodos` is where the rule
	 * that matters lives: all of them or none.
	 */
	batch: formAction((ctx, formData) => {
		const verb = formData.get('do');
		if (!isBatchVerb(verb)) throw new ValidationError({ key: 'errors.todos.invalidBatch' });

		const count = batchTodos(ctx, verb, formData.getAll('id'), {
			status: formData.get('status'),
			add: formData.get('add'),
			remove: formData.get('remove'),
			notebookId: formData.get('notebookId')
		});
		return { success: true, count };
	}),

	/** Put one away, or take it back out. Neither done nor gone. */
	archive: formAction((ctx, formData) => {
		archiveTodo(ctx, Number(formData.get('id')), formData.get('away') !== 'false');
		return { success: true, action: 'archive' };
	}),

	setStatus: formAction((ctx, formData) => {
		setTodoStatus(ctx, Number(formData.get('id')), formData.get('status'));
	}),

	schedule: formAction((ctx, formData) => {
		scheduleTodo(ctx, Number(formData.get('id')), formData.get('scheduledDate'));
	}),

	remove: formAction((ctx, formData) => {
		deleteTodo(ctx, Number(formData.get('id')));
	}),

	delegate: formAction((ctx, formData) => {
		delegateTodo(ctx, Number(formData.get('id')), {
			date: formData.get('date'),
			startTime: formData.get('startTime'),
			durationMinutes: formData.get('durationMinutes'),
			mode: formData.get('mode'),
			categoryId: formData.get('categoryId'),
			activityId: formData.get('activityId'),
			remindLeadMinutes: formData.get('remindLeadMinutes')
		});
	})
};
