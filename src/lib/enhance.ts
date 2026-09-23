import { enhance as kitEnhance } from '$app/forms';
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
	const outside = form.id
		? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(form.id)}"]`)]
		: [];
	return [...new Set([...own, ...outside])];
}

/** What a submission is saying, as one comparable string. */
function said(data: FormData): string {
	return [...data.entries()]
		.map(([key, value]) => `${key}=${value instanceof File ? value.name : value}`)
		.join('&');
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
				if (typeof after === 'function') await after(outcome);
				else await outcome.update();
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
