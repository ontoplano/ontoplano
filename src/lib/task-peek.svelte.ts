import type { Action } from 'svelte/action';
import { refAt, type PeekTask, type TodoRefs } from '$lib/markdown';

/**
 * A task reference, looked at without leaving the writing it is in.
 *
 * `TASK:#4` in a note is drawn as the task's title, and pressing it opens the
 * task. Resting on it shows the task itself — its state, its notes, its day —
 * as a card with nothing to press: reading the reference should not need a
 * trip to the list and back. One card for the whole app (`TaskPeek`, in the
 * layout); anything that draws references opts in with `use:peekRefs`.
 */

/** How long the pointer rests before the card appears — a little over a tooltip's. */
const DELAY_MS = 400;

export const peek = $state<{ task: PeekTask | null; rect: DOMRect | null }>({
	task: null,
	rect: null
});

function hide() {
	peek.task = null;
	peek.rect = null;
}

/**
 * On whatever holds rendered writing: the references inside it answer to a
 * resting pointer, and to focus, with the card of the task they name. The
 * map is the same one the references were resolved against.
 */
export const peekRefs: Action<HTMLElement, TodoRefs | undefined> = (node, initial) => {
	let refs = initial;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const refOf = (target: EventTarget | null) => {
		const ref = refAt(target);
		return ref?.kind === 'task' ? ref : null;
	};

	function show(ref: { seq: number; link: HTMLElement }) {
		const task = refs?.get(ref.seq)?.task;
		if (!task) return;
		peek.task = task;
		peek.rect = ref.link.getBoundingClientRect();
	}

	function enter(event: Event) {
		const ref = refOf(event.target);
		if (!ref) return;
		clearTimeout(timer);
		if (event.type === 'focusin') return show(ref);
		timer = setTimeout(() => show(ref), DELAY_MS);
	}

	function leave(event: Event) {
		if (!refOf(event.target)) return;
		clearTimeout(timer);
		hide();
	}

	node.addEventListener('pointerover', enter);
	node.addEventListener('pointerout', leave);
	node.addEventListener('focusin', enter);
	node.addEventListener('focusout', leave);
	addEventListener('scroll', hide, { capture: true, passive: true });

	return {
		update(next) {
			refs = next;
		},
		destroy() {
			clearTimeout(timer);
			node.removeEventListener('pointerover', enter);
			node.removeEventListener('pointerout', leave);
			node.removeEventListener('focusin', enter);
			node.removeEventListener('focusout', leave);
			removeEventListener('scroll', hide, { capture: true });
			hide();
		}
	};
};
