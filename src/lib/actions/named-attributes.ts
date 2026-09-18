import { notify } from '$lib/notify.svelte';

/**
 * An attribute with a value and no name never leaves the form.
 *
 * The server reads the pairs by name — a pair whose name is blank is not an
 * attribute — so a value typed beside an empty name was accepted, saved as
 * nothing, and the form closed as if it had worked. Emptying a name is still
 * how a row is cleared; what is refused is the half-written one, and it is
 * refused where somebody can still see what they typed.
 *
 * Capture phase, so it wins over the form's own submit handling the way
 * `armed` does.
 */
export function namedAttributes(node: HTMLElement, message: () => string) {
	const form = node.closest('form');
	if (!form) return;

	function orphan(): HTMLInputElement | null {
		const names = [...form!.querySelectorAll<HTMLInputElement>('[name="fieldName"]')];
		const values = [...form!.querySelectorAll<HTMLInputElement>('[name="fieldValue"]')];
		const at = values.findIndex((value, i) => value.value.trim() && !names[i]?.value.trim());
		return at === -1 ? null : (names[at] ?? null);
	}

	function check(event: Event) {
		const unnamed = orphan();
		if (!unnamed) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		notify.error(message());
		unnamed.focus();
	}

	form.addEventListener('submit', check, true);

	return {
		destroy() {
			form?.removeEventListener('submit', check, true);
		}
	};
}
