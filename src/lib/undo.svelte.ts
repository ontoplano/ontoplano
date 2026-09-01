/**
 * An action that waits, and can be taken back.
 *
 * Nothing is soft-deleted, marked provisional or reconciled afterwards. The
 * request simply has not been sent yet: the screen shows the outcome at once,
 * the submission is held for a few seconds, and Undo cancels it. So there is no
 * state to unwind and no way for a change to survive somewhere a query forgot
 * to filter — the only cost is that closing the tab inside the window means the
 * action never happens, which loses nothing.
 *
 * Two shapes use this. A **deletion** hides its row while it waits, so the list
 * reads as though it were already gone; `isLeaving` is what a list asks. A
 * **change** — ticking a todo off — leaves the row where it is and shows the new
 * state, so the list asks `isPending` and renders it done.
 *
 * For deletion the confirmation stays. That is the deliberate half — a dialog or
 * an armed second click, so nothing is destroyed by a reflex. This is the other
 * half: the seconds between saying yes and meaning it. A tick has no
 * confirmation and does not need one, because this is the whole of its safety
 * net.
 *
 * The window comes from the instance's config (`[ui] undo_seconds`); zero sends
 * immediately and shows no toast.
 */
export type Pending = {
	id: number;
	/** What the toast says: "Deleted olive oil", "Completed call the landlord". */
	message: string;
	/** The row this is about — `${kind}:${id}`. */
	key: string;
	/** Whether the row is hidden from lists while this waits. */
	hides: boolean;
	send: () => void;
	timer: ReturnType<typeof setTimeout>;
	until: number;
};

let nextId = 1;

export const undo = $state<{ pending: Pending[]; seconds: number }>({
	pending: [],
	seconds: 5
});

/** Whether a row is on its way out, so a list can leave it out already. */
export function isLeaving(key: string): boolean {
	return undo.pending.some((p) => p.key === key && p.hides);
}

/** Whether anything at all is waiting on this row, so it can show the outcome. */
export function isPending(key: string): boolean {
	return undo.pending.some((p) => p.key === key);
}

/**
 * Hold an action for the undo window, then send it.
 *
 * With a window of zero it sends now, which is what an instance that has turned
 * this off wants. A second action on the same row replaces the first: two holds
 * on one todo would fire in whichever order their timers landed.
 */
function hold(key: string, message: string, hides: boolean, send: () => void): void {
	if (undo.seconds <= 0) {
		send();
		return;
	}

	for (const p of undo.pending.filter((p) => p.key === key)) clearTimeout(p.timer);
	undo.pending = undo.pending.filter((p) => p.key !== key);

	const id = nextId++;
	const timer = setTimeout(() => {
		undo.pending = undo.pending.filter((p) => p.id !== id);
		send();
	}, undo.seconds * 1000);

	undo.pending = [
		...undo.pending,
		{ id, message, key, hides, send, timer, until: Date.now() + undo.seconds * 1000 }
	];
}

/** A row that leaves the screen now and is deleted in a few seconds. */
export function deleteLater(key: string, label: string, send: () => void): void {
	hold(key, `Deleted ${label}`, true, send);
}

/** A row that shows its new state now and is written in a few seconds. */
export function changeLater(key: string, message: string, send: () => void): void {
	hold(key, message, false, send);
}

/** Take back whatever is waiting on one row — clicking the tick again. */
export function cancelFor(key: string): void {
	for (const p of undo.pending.filter((p) => p.key === key)) clearTimeout(p.timer);
	undo.pending = undo.pending.filter((p) => p.key !== key);
}

export function takeBack(id: number): void {
	const found = undo.pending.find((p) => p.id === id);
	if (!found) return;

	clearTimeout(found.timer);
	undo.pending = undo.pending.filter((p) => p.id !== id);
}

/**
 * Send everything still waiting, now.
 *
 * Called when the page is being left: something somebody confirmed should not be
 * quietly forgotten because they clicked a link four seconds later.
 */
export function flushNow(): void {
	for (const p of undo.pending) {
		clearTimeout(p.timer);
		p.send();
	}
	undo.pending = [];
}
