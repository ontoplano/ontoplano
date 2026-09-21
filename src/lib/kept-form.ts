/**
 * What somebody typed, kept across an accidental close.
 *
 * "some times i am writing a task and accidentally press esc and lose all shit
 * i've typed: come on, it just shouldn't reset the form."
 *
 * A modal unmounts its body when it closes — which is right, because the same
 * dialog is reused for different subjects and a form that remembered the last
 * one would show it against the next. So the fields themselves cannot survive;
 * what they held has to be written down before they go and put back when they
 * come.
 *
 * Only for the ways out that are accidents: Escape, the backdrop, the back
 * arrow. Cancel and a save that worked are somebody saying they are finished
 * with it, and both call `discardForm` — a draft that comes back after Cancel
 * is the same surprise in the other direction.
 *
 * In memory, not storage: this is for the half-written thing you are looking
 * at, and a draft that outlives the tab is a different feature with different
 * questions (whose is it, when does it go stale, what if the task exists now).
 */

import { tick } from 'svelte';

/** Drafts by the key their form was given, newest value per key. */
const drafts = new Map<string, Map<string, string>>();

/**
 * Fields whose value is not somebody's typing.
 *
 * A hidden field is assembled from the controls around it — `TagInput` posts
 * its chips that way — so restoring it would put back a value the visible
 * control has no idea about. The visible control is restored instead and
 * writes its own hidden field again.
 */
function worthKeeping(field: Element): field is HTMLInputElement | HTMLTextAreaElement {
	if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
	if (field.type === 'hidden' || field.type === 'file' || field.type === 'password') return false;
	return field.name !== '';
}

/**
 * Forms somebody has finished with, between saying so and the form going.
 *
 * Cancel and a save both throw the draft away and then close the dialog, and
 * closing it unmounts the form — which is the moment this writes one down. So
 * discarding has to outlast the press: without this, Cancel deleted the draft
 * and the unmount immediately put it back.
 */
const finished = new Set<string>();

/** Throw away what was kept, for a form somebody has finished with. */
export function discardForm(key: string): void {
	drafts.delete(key);
	finished.add(key);
}

/**
 * Remember this form while it is going away, and fill it in when it comes back.
 *
 * ```svelte
 * <form use:keptForm={'new-task'}>
 * ```
 *
 * Restoring happens on mount rather than on open, because the body is mounted
 * by the opening: by the time this action runs the fields are there and the
 * dialog is about to be shown.
 */
export function keptForm(node: HTMLFormElement, key: string) {
	/*
	 * After the first flush, not during it.
	 *
	 * An action runs as its element is created, and the fields are seeded from
	 * their props in the effects that follow — so anything written here is
	 * written over a moment later, by the empty strings a new form is built
	 * from. `tick` is the end of that.
	 */
	void tick().then(() => restore(node, key));

	return {
		destroy() {
			remember(node, key);
		}
	};
}

function restore(node: HTMLFormElement, key: string): void {
	const held = drafts.get(key);
	if (!held) return;
	{
		for (const field of node.elements) {
			if (!worthKeeping(field)) continue;
			const was = held.get(field.name);
			if (was === undefined) continue;
			if (
				field instanceof HTMLInputElement &&
				(field.type === 'checkbox' || field.type === 'radio')
			)
				field.checked = was === 'on';
			else field.value = was;
			// The value is set on the element, and Svelte's own state was seeded
			// from the props; an input event is what tells anything bound to it.
			field.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}
}

function remember(node: HTMLFormElement, key: string): void {
	if (finished.delete(key)) return;

	const typed = new Map<string, string>();
	let anything = false;
	for (const field of node.elements) {
		if (!worthKeeping(field)) continue;
		const value =
			field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')
				? field.checked
					? 'on'
					: ''
				: field.value;
		typed.set(field.name, value);
		if (value !== '') anything = true;
	}
	// An empty form is not a draft. Keeping one would put yesterday's blanks
	// back over a form that had been seeded with something.
	if (anything) drafts.set(key, typed);
	else drafts.delete(key);
}
