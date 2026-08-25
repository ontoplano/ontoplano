/**
 * Ignore clicks for a moment after the element appears.
 *
 * Two-step deletes put "Confirm?" exactly where "Delete" was, so a
 * double-click — one to arm, one that lands before the eye catches up —
 * deleted the row. This makes the second click hit nothing: the button is inert
 * until it has been on screen long enough to have been read.
 *
 * Applied to the confirm half of every destructive pair. The listener runs in
 * the capture phase so it wins over whatever the button itself does, including
 * a form submit.
 */
export function armed(node: HTMLElement, delay: number = 450) {
	let ready = false;

	const timer = setTimeout(() => {
		ready = true;
		node.removeAttribute('aria-disabled');
		node.classList.remove('is-unarmed');
	}, delay);

	node.setAttribute('aria-disabled', 'true');
	node.classList.add('is-unarmed');

	function swallow(event: Event) {
		if (ready) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	node.addEventListener('click', swallow, true);
	node.addEventListener('keydown', swallow, true);

	return {
		destroy() {
			clearTimeout(timer);
			node.removeEventListener('click', swallow, true);
			node.removeEventListener('keydown', swallow, true);
		}
	};
}
