import { enhance as kitEnhance } from '$app/forms';
import { navigating } from '$app/state';
import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance`, with one press meaning one submission.
 *
 * Pressing Create twice made two tasks. The press is not the mistake — the
 * first one takes long enough to look like it missed, so pressing again is
 * what anybody does — and asking people to press more carefully is not a fix.
 * So while a form is in flight its buttons are disabled, and a submission
 * that repeats the one already going is dropped.
 *
 * **Identical, not merely second.** A form can genuinely be sent twice in a
 * row with something new to say each time — the notebook's divider posts a
 * width as it is dragged, and swallowing the second post left the panel
 * remembering where the drag passed through rather than where it ended. What
 * a double press sends is byte-for-byte what the first press sent; what a
 * drag sends is a different number. So the comparison is the form's own data,
 * which tells those two apart without either of them having to declare
 * anything.
 *
 * Here rather than per form, and imported *instead of* `$app/forms`, so a
 * form written next year is guarded by existing. The eslint config refuses
 * the other import for that reason.
 *
 * The buttons: a form's own submitters, plus anything elsewhere on the page
 * pointing at it with `form="its-id"` — a modal's footer sits outside the
 * `<form>` it submits, which is exactly where the Create button was.
 */
function submitters(form: HTMLFormElement): HTMLButtonElement[] {
	const own = [...form.querySelectorAll<HTMLButtonElement>('button:not([type="button"])')];
	/*
	 * `getAttribute('id')`, never `form.id`.
	 *
	 * A form exposes its own named controls as properties of itself, and those
	 * win over the element's — so on any form carrying a field called `id`,
	 * `form.id` is that `<input>` rather than the string. Which is every edit
	 * form in this app: the hidden field naming the row being edited is called
	 * `id`. `CSS.escape` then stringified an element into
	 * `[object HTMLInputElement]`, the selector matched nothing, and the Save
	 * button in the dialog's footer was never disabled — while Create, on a
	 * form with no such field, worked perfectly. One symptom, and it looked
	 * like the footer being outside the form.
	 */
	const id = form.getAttribute('id');
	const outside = id
		? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(id)}"]`)]
		: [];
	return [...new Set([...own, ...outside])];
}

/** What a submission is saying, as one comparable string. */
function said(data: FormData): string {
	return [...data.entries()]
		.map(([key, value]) => `${key}=${value instanceof File ? value.name : value}`)
		.join('&');
}

/**
 * A form answered after somebody has already moved on does not call them back.
 *
 * `update()` re-runs the loads of the page the form is on, and SvelteKit lets
 * an invalidation win over a navigation already under way — so writing a note
 * and pressing another notebook before the write came back left you on the
 * first one, with the press silently dropped. The page being left does not
 * need fresh data: the one being opened loads its own.
 */
type Outcome = Parameters<
	Extract<Awaited<ReturnType<SubmitFunction>>, (...args: never[]) => unknown>
>[0];

function stayingPut(outcome: Outcome): Outcome {
	const update = outcome.update;
	return {
		...outcome,
		update: (options?: Parameters<typeof update>[0]) =>
			update(navigating.to ? { ...options, invalidateAll: false } : options)
	};
}

/**
 * A form is emptied after its handler is done with it, never before.
 *
 * SvelteKit's `update()` resets the form first and then waits for the page's
 * data to come back. Every dialog here closes *after* `update()` — so for the
 * length of a round trip the dialog stood open with its fields reset, and a
 * bound field resets to nothing: pressing Save on Edit notebook blanked the
 * title before the dialog went away. It was fixed form by form, with
 * `reset: false`, and kept coming back with the next form written the
 * ordinary way.
 *
 * So `update()` never resets here. It notes whether a reset was asked for —
 * SvelteKit's default is yes — and the reset happens once the handler has
 * returned, by which time a dialog has been told to close and the reset lands
 * in the same frame, unseen. A form still on screen, like a quick-add row, is
 * cleared exactly as before, one reload later.
 */
function resetAfterwards(outcome: Outcome): { outcome: Outcome; finish: () => void } {
	const update = outcome.update;
	let wanted = false;
	return {
		outcome: {
			...outcome,
			update: (options?: Parameters<typeof update>[0]) => {
				wanted = options?.reset ?? true;
				return update({ ...options, reset: false });
			}
		},
		finish: () => {
			const form = outcome.formElement;
			// `HTMLFormElement.prototype`, because a field called `reset` would
			// shadow the method on the form itself.
			if (wanted && outcome.result.type === 'success' && form.isConnected)
				HTMLFormElement.prototype.reset.call(form);
		}
	};
}

export function enhance(form: HTMLFormElement, submit?: SubmitFunction) {
	let sending: string | null = null;

	const guarded: SubmitFunction = (event) => {
		const saying = said(event.formData);
		if (sending === saying) {
			// The second press of a double click: the first one is already
			// doing what was asked, and there is nothing to tell anybody.
			event.cancel();
			return;
		}
		sending = saying;
		const pressed = submitters(event.formElement);
		for (const button of pressed) button.disabled = true;

		const after = submit?.(event);
		return async (outcome) => {
			try {
				const { outcome: answered, finish } = resetAfterwards(stayingPut(outcome));
				if (typeof after === 'function') await after(answered);
				else await answered.update();
				finish();
			} finally {
				sending = null;
				// A form that has been taken off the screen takes its buttons
				// with it; setting a property on a detached node is harmless.
				for (const button of pressed) button.disabled = false;
			}
		};
	};

	return kitEnhance(form, guarded);
}
