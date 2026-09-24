import { page } from '$app/state';
import { replaceState } from '$app/navigation';

/**
 * Open a thing's editor because the address asked for it.
 *
 * Capture writes into a room you are not looking at — that is the whole point
 * of it — and the receipt afterwards said "Added to your to-dos" and left you
 * to go and find it. Especially on a phone, where "add it now, say more about
 * it in a second" is most of how the thing gets used. So the receipt offers
 * Edit, Edit is a link into the room with the new row's id on it, and this is
 * what the room does about that.
 *
 * **The parameter is taken off once it has been used.** It is an instruction
 * rather than a state: leaving it in the address means going back to the room
 * later — from the wheel, from a bookmark, from the back button — opens the
 * editor again over something you were reading.
 *
 * Call it once, at the top of a room:
 *
 *     openFromUrl((id) => startEdit(todos.find((one) => one.id === id)));
 *
 * It fires for each new id the address carries, so two captures in a row each
 * open their own editor rather than the second being swallowed as "already
 * handled".
 */

/** What the address calls it. One word, the same in every room. */
export const EDIT_PARAM = 'edit';

export function openFromUrl(open: (id: number) => void, param: string = EDIT_PARAM): void {
	let acted: string | null = null;

	$effect(() => {
		const asked = page.url.searchParams.get(param);
		if (!asked || asked === acted) return;
		acted = asked;

		const id = Number(asked);
		if (!Number.isInteger(id) || id <= 0) return;

		/*
		 * After the room has drawn, because what it is asked to open is usually
		 * a row that arrived in the same load — the editor cannot be opened on
		 * a list that is not there yet.
		 */
		queueMicrotask(() => open(id));

		/*
		 * And the address goes back to naming the room.
		 *
		 * `replaceState` rather than `goto`: this is not somewhere somebody
		 * navigated to, so it should not be a step the back button walks
		 * through — pressing back after closing the editor would otherwise
		 * reopen it.
		 *
		 * Built as a string rather than by mutating a `URL`: this is already a
		 * resolved address that the page is standing on, and the `?edit=` on
		 * the end of it is the only part being taken away.
		 */
		const here = page.url.pathname + withoutParam(page.url.search, param);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(here, page.state);
	});
}

/** A query string with one parameter taken out of it. */
function withoutParam(search: string, param: string): string {
	const kept = search
		.replace(/^\?/, '')
		.split('&')
		.filter((pair) => pair !== '' && decodeURIComponent(pair.split('=')[0]) !== param);
	return kept.length > 0 ? `?${kept.join('&')}` : '';
}

/** The address that opens one of these in its own room. */
export function editUrl(room: string, id: number, param: string = EDIT_PARAM): string {
	return `${room}?${param}=${id}`;
}
