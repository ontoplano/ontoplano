export function autofocus(node: HTMLElement) {
	const target = node.matches('input:not([type="hidden"]), textarea, select')
		? node
		: node.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select');
	target?.focus();
}

/**
 * Focus this node itself, whatever it is.
 *
 * `autofocus` hunts for the field inside a form, which is right for a dialog
 * and wrong for a lone button. The board's delete confirmation wants the
 * keyboard on its Delete button, so that `x` then Enter finishes what `x`
 * started — and that is only safe beside `armed`, which swallows the first
 * moments of keys, so the keystroke that opened the question cannot answer it.
 */
export function focusHere(node: HTMLElement) {
	node.focus();
}
