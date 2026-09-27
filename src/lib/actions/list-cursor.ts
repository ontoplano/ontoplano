import { keepInView } from '$lib/actions/keep-in-view';

/**
 * Where j/k is standing: `use:listCursor={index === selected}`.
 *
 * Wears the one cursor look (`.kb-cursor` / `[data-kb-cursor]` in
 * `layout.css`) and keeps the row in view as the cursor moves onto it, so a
 * list that gains keyboard navigation writes one attribute rather than a
 * class expression and a second action. An attribute rather than a class:
 * Svelte rewrites `class` whenever the element's own class expression
 * changes, which would wipe a class set from here.
 */
export function listCursor(node: HTMLElement, here: boolean) {
	const wear = (on: boolean) => node.toggleAttribute('data-kb-cursor', on);
	wear(here);
	const view = keepInView(node, here);
	return {
		update(next: boolean) {
			wear(next);
			view.update(next);
		}
	};
}
