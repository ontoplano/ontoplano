/**
 * Paint the sentences that are still English, on a build that is not the real one.
 *
 * A dev or staging build marks every borrowed message with a zero-width
 * character at each end (`BORROWED_MARK`). This finds them and puts
 * `data-untranslated` on the element they landed in; a rule in the app's own
 * stylesheet turns that red. Two screens side by side then say what is done and
 * what is not, without anybody reading a list of keys.
 *
 * **It never touches the text.** Svelte owns those nodes — it holds references
 * to them and rewrites them on every update — so replacing one to wrap it in a
 * span is how a diagnostic becomes a rendering bug. Setting an attribute on the
 * parent is safe: Svelte sets the attributes it knows about and leaves the rest
 * alone.
 *
 * What it misses: a message that does not reach the DOM as its own text. A
 * sentence rendered through markdown, trimmed, or sliced loses the marks with
 * the rest of its whitespace, and reads as translated when it is not. This is a
 * diagnostic for a screen at a glance, not a substitute for the count in
 * settings, which is exact.
 *
 * Nothing here runs in production. The caller is the root layout, behind the
 * same check that decides whether to fetch the list at all, so the bundle a
 * reader downloads never includes the marks or the module that looks for them.
 */
import { BORROWED_MARK } from './core.js';

/** How long to wait before looking again, when the page is changing quickly. */
const SETTLE_MS = 50;

function markUnder(root: Node): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();

	while (node) {
		const text = node.nodeValue;
		const parent = node.parentElement;
		if (text?.includes(BORROWED_MARK) && parent && !parent.hasAttribute('data-untranslated')) {
			parent.setAttribute('data-untranslated', '');
		}
		node = walker.nextNode();
	}
}

/**
 * Watch the page for as long as it exists.
 *
 * Returns the way to stop, so the layout's effect can tidy up. A batch of
 * changes is answered once rather than per node: a keystroke in a form can
 * rewrite a hundred of them, and walking the tree a hundred times for one
 * answer is how a diagnostic makes the app it is diagnosing feel slow.
 */
export function markUntranslated(): () => void {
	markUnder(document.body);

	let pending: ReturnType<typeof setTimeout> | undefined;
	const observer = new MutationObserver(() => {
		clearTimeout(pending);
		pending = setTimeout(() => markUnder(document.body), SETTLE_MS);
	});

	observer.observe(document.body, { childList: true, subtree: true, characterData: true });

	return () => {
		clearTimeout(pending);
		observer.disconnect();
	};
}
