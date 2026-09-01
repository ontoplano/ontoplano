/**
 * Number boxes that behave like somebody is about to type a number.
 *
 * A number field showing `0` puts the caret after the zero when you click it,
 * so typing 2 gives you 02 — and 02 is not what anybody meant. The browser is
 * being consistent with text fields, where the existing value is usually
 * something you want to edit rather than replace. In a small numeric box it
 * almost never is.
 *
 * Two behaviours, and neither has to be remembered at a call site: this is
 * wired once, for the document, in the root layout. A number field added
 * tomorrow gets it without anybody knowing this file exists.
 *
 * 1. Focusing selects what is there, so the first keystroke replaces it.
 * 2. A leading zero is dropped as it is typed, for the paths that get past the
 *    first rule — tabbing back, a chip that filled the box, a phone keyboard.
 */

/** `02` → `2`, and `0.5` left alone. */
export function withoutLeadingZeros(value: string): string {
	return value.replace(/^(-?)0+(?=\d)/, '$1');
}

function isNumberField(target: EventTarget | null): target is HTMLInputElement {
	return target instanceof HTMLInputElement && target.type === 'number';
}

export function smartNumberFields(root: Document): () => void {
	/**
	 * The field the current click is focusing.
	 *
	 * A click is focus and then a caret placement, in that order, and the second
	 * undoes the selection the first made. So the selection is made on focus and
	 * the caret placement that follows *that same click* is cancelled — later
	 * clicks in an already-focused box place the caret as usual, which is how
	 * somebody edits one digit of a longer number.
	 */
	let focusing: HTMLInputElement | null = null;

	const onFocusIn = (event: FocusEvent) => {
		if (!isNumberField(event.target)) return;
		focusing = event.target;
		event.target.select();
	};

	const onMouseUp = (event: MouseEvent) => {
		if (!isNumberField(event.target) || event.target !== focusing) return;
		event.preventDefault();
		focusing = null;
	};

	const onFocusOut = () => {
		focusing = null;
	};

	const onInput = (event: Event) => {
		if (!isNumberField(event.target)) return;
		const field = event.target;
		const fixed = withoutLeadingZeros(field.value);
		if (fixed === field.value) return;

		field.value = fixed;
		// Dispatched rather than assigned quietly: a framework binding learns the
		// new value from the event, and a value only the DOM knows about is one
		// the form will disagree with on the next render.
		field.dispatchEvent(new Event('input', { bubbles: true }));
	};

	root.addEventListener('focusin', onFocusIn);
	root.addEventListener('mouseup', onMouseUp);
	root.addEventListener('focusout', onFocusOut);
	root.addEventListener('input', onInput);

	return () => {
		root.removeEventListener('focusin', onFocusIn);
		root.removeEventListener('mouseup', onMouseUp);
		root.removeEventListener('focusout', onFocusOut);
		root.removeEventListener('input', onInput);
	};
}
