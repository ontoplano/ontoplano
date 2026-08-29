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
export function suppressAutofill(root: ParentNode & Node): () => void {
	const quiet = (node: ParentNode) => {
		for (const field of node.querySelectorAll(
			'input:not([autocomplete]), textarea:not([autocomplete])'
		)) {
			field.setAttribute('autocomplete', 'off');
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
