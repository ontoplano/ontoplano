/**
 * Autofill is opt-in here, not opt-out.
 *
 * Chrome guesses at any bare input and offers passwords and credit cards over
 * task titles, which on the phone drops a row of autofill icons onto every
 * keyboard. The app's answer used to be `autocomplete="off"` written on each
 * input by hand — a rule you have to remember is a rule that gets forgotten,
 * and it was, 44 times.
 *
 * So the shell calls this once: any input or textarea that says nothing gets
 * `autocomplete="off"`, now and as forms mount. A field that *wants* autofill
 * — email, current-password, new-password on the auth forms — declares it and
 * is left alone, because an explicit attribute is the opt-in.
 */
/**
 * `autocomplete="off"` is not enough on its own.
 *
 * Chrome — and Android's autofill framework behind it — treats that attribute
 * as a hint it may ignore, which is why the command palette still raised a row
 * of key, card and pin icons over the keyboard while carrying it. These are the
 * flags the password managers and Chrome's own heuristics actually read, and
 * they go on by the same rule as the attribute above: everything gets them,
 * a field that wants autofill opts out by declaring what it is.
 */
const IGNORE_FLAGS: [string, string][] = [
	// Chrome's own heuristics: a field it cannot classify is not offered
	// addresses or cards.
	['data-form-type', 'other'],
	['data-lpignore', 'true'], // LastPass
	['data-1p-ignore', ''], // 1Password
	['data-bwignore', ''] // Bitwarden
];

export function suppressAutofill(root: ParentNode & Node): () => void {
	const quiet = (node: ParentNode) => {
		for (const field of node.querySelectorAll(
			'input:not([autocomplete]), textarea:not([autocomplete])'
		)) {
			field.setAttribute('autocomplete', 'off');
		}
		// The flags go on every field that has not asked for autofill —
		// including the ones that already said `autocomplete="off"` by hand,
		// which is where this was still leaking.
		for (const field of node.querySelectorAll(
			'input:not([autocomplete]), input[autocomplete="off"], textarea:not([autocomplete]), textarea[autocomplete="off"]'
		)) {
			for (const [name, value] of IGNORE_FLAGS) {
				if (!field.hasAttribute(name)) field.setAttribute(name, value);
			}
		}
	};

	quiet(root);

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const added of mutation.addedNodes) {
				if (added instanceof Element) quiet(added);
			}
		}
	});
	observer.observe(root, { subtree: true, childList: true });

	return () => observer.disconnect();
}
