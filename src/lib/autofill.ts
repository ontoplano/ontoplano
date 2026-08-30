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

/** Fields that have not declared what they are, and so want nothing. */
const UNCLAIMED =
	'input:not([autocomplete]), input[autocomplete="off"], textarea:not([autocomplete]), textarea[autocomplete="off"]';

/**
 * Chrome classifies a field by its `name`, `id` and label before it ever reads
 * `autocomplete`, and for a field it has classified as part of an address it
 * treats `autocomplete="off"` as advisory. `name="name"` on the New Activity
 * form is exactly that: Chrome reads it as a person's name and offers the
 * saved address profile, which is where the key and card icons on the phone
 * keyboard were still coming from after the attribute was in place.
 *
 * The submitted `name` is the server's business and cannot change here, but
 * the `id` can: an id the classifier cannot read as an address part takes one
 * of its three signals away. Given rather than removed, because a field with
 * no id at all is one a label cannot point at.
 */
let seq = 0;
function blurTheClassifier(field: Element) {
	if (!field.id) field.id = `f${(seq += 1)}`;
	// A form is classified as a whole; one that says it wants nothing is a
	// weaker candidate for the address heuristic than one that says nothing.
	const form = field.closest('form');
	if (form && !form.hasAttribute('autocomplete')) form.setAttribute('autocomplete', 'off');
	if (form) {
		for (const [name, value] of IGNORE_FLAGS) {
			if (!form.hasAttribute(name)) form.setAttribute(name, value);
		}
	}
}

export function suppressAutofill(root: ParentNode & Node): () => void {
	const stamp = (field: Element) => {
		if (!field.hasAttribute('autocomplete')) field.setAttribute('autocomplete', 'off');
		for (const [name, value] of IGNORE_FLAGS) {
			if (!field.hasAttribute(name)) field.setAttribute(name, value);
		}
		blurTheClassifier(field);
	};

	const quiet = (node: Element | (ParentNode & Node)) => {
		// The node itself, not only its descendants. `querySelectorAll` never
		// returns the element it is called on, so a dialog that mounts an input
		// as the added node — or any field added on its own — was walked past.
		if (node instanceof Element && node.matches(UNCLAIMED)) stamp(node);
		for (const field of node.querySelectorAll(UNCLAIMED)) stamp(field);
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
