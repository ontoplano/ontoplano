import { SvelteSet } from 'svelte/reactivity';

/**
 * Several rows chosen at once, and the one thing about to be done to them.
 *
 * Tasks and notes both offer "Select many", and it has to behave the same on
 * both: the same button, the same round boxes, the same count, the same keys.
 * The state is this class and the drawing is `SelectionBar`, `SelectBox` and
 * `BatchDialog`, so a list that wants a selection declares its verbs and gets
 * the rest.
 */
export class Selection<Verb extends string> {
	selecting = $state(false);
	readonly chosen = new SvelteSet<number>();
	/** The verb whose dialog is open, or null. */
	verb = $state<Verb | null>(null);
	/** A refused press's message, shown in the dialog. */
	error = $state<string | undefined>();

	start() {
		this.selecting = true;
	}

	end() {
		this.selecting = false;
		this.chosen.clear();
		this.verb = null;
		this.error = undefined;
	}

	toggle(id: number) {
		if (this.chosen.has(id)) this.chosen.delete(id);
		else this.chosen.add(id);
	}

	has(id: number): boolean {
		return this.chosen.has(id);
	}

	open(verb: Verb) {
		this.error = undefined;
		this.verb = verb;
	}

	close() {
		this.verb = null;
	}

	/**
	 * Only what is on screen stays chosen.
	 *
	 * A filter that hides a chosen row must not leave it quietly in the batch:
	 * nobody deletes what they cannot see. Call from an `$effect` with the ids
	 * the list is showing.
	 */
	keep(visible: Iterable<number>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once here; nothing tracks it.
		const shown = new Set(visible);
		for (const id of this.chosen) if (!shown.has(id)) this.chosen.delete(id);
	}

	/**
	 * The keys a selecting list answers to, for its own `keydown` handler.
	 *
	 * Escape closes the open dialog, then the selection; Space toggles the row
	 * under the cursor. True when the key was taken.
	 */
	handleKey(e: KeyboardEvent, current: () => number | undefined): boolean {
		if (e.key === 'Escape') {
			if (this.verb) {
				this.verb = null;
				return true;
			}
			if (this.selecting) {
				this.end();
				return true;
			}
			return false;
		}
		if (
			this.selecting &&
			!this.verb &&
			e.key === ' ' &&
			(!(e.target instanceof HTMLButtonElement) || e.target.getAttribute('role') === 'checkbox')
		) {
			const id = current();
			if (id === undefined) return false;
			e.preventDefault();
			this.toggle(id);
			return true;
		}
		return false;
	}
}
