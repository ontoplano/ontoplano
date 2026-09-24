/**
 * One press means one submission, on every form on the page.
 *
 * `$lib/enhance` already does this for the forms it wraps, which is most of
 * them: while a submission is in flight its buttons are disabled and an
 * identical repeat is dropped. The ones it does not wrap are the plain posts
 * that navigate — Save on a settings page, a review, an import — and those are
 * exactly the slow ones. The page stays on screen while the request is out, so
 * pressing Save twice is the ordinary thing to do, and the second press is a
 * second write.
 *
 * So the guard is a listener on the document rather than something each form
 * opts into. A form written next year is covered by existing, which is the
 * same reason `enhance` lives where it does.
 *
 * **After the event, not during it.** A submitter disabled inside its own
 * `submit` handler stops being a submitter, and the browser drops its name and
 * value from what it sends — which silently changes what a form with two
 * submit buttons is saying. One turn of the event loop is enough: by then the
 * request has been built.
 */

/**
 * How long a disabled button waits for a navigation that never comes.
 *
 * A handler that cancels the post and goes somewhere itself would otherwise
 * leave its buttons dead. Long enough not to interrupt a slow request, short
 * enough that nobody sits looking at a button that will not press.
 */
const RELEASE_AFTER_MS = 20_000;

/** Marks the ones this guard turned off, so it releases only its own. */
const HELD = 'onePress';

/** A form's own submit buttons, plus anything pointing at it with `form=`. */
function submitters(form: HTMLFormElement): HTMLButtonElement[] {
	const own = [...form.querySelectorAll<HTMLButtonElement>('button:not([type="button"])')];
	const outside = form.id
		? [...document.querySelectorAll<HTMLButtonElement>(`button[form="${CSS.escape(form.id)}"]`)]
		: [];
	return [...new Set([...own, ...outside])];
}

/** Let go of every button this guard is holding. */
export function releaseHeldButtons(): void {
	for (const button of document.querySelectorAll<HTMLButtonElement>(`button[data-one-press]`)) {
		delete button.dataset[HELD];
		button.disabled = false;
	}
}

export function guardSubmits(): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const onSubmit = (event: SubmitEvent) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;

		const pressed = submitters(form);
		setTimeout(() => {
			for (const button of pressed) {
				if (button.disabled) continue;
				button.dataset[HELD] = 'held';
				button.disabled = true;
			}
			clearTimeout(timer);
			timer = setTimeout(releaseHeldButtons, RELEASE_AFTER_MS);
		});
	};

	document.addEventListener('submit', onSubmit);
	// Coming back to a page out of the history cache brings its old DOM with
	// it, disabled buttons included.
	window.addEventListener('pageshow', releaseHeldButtons);

	return () => {
		clearTimeout(timer);
		document.removeEventListener('submit', onSubmit);
		window.removeEventListener('pageshow', releaseHeldButtons);
		releaseHeldButtons();
	};
}
