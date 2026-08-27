/**
 * A delete that waits, and can be taken back.
 *
 * The confirmation stays. That is the deliberate half — a dialog or an armed
 * second click, so nothing is destroyed by a reflex. This is the other half:
 * the seconds between saying yes and meaning it.
 *
 * Nothing is soft-deleted and nothing is restored. The request simply has not
 * been sent yet: the row disappears from the screen at once, the submission is
 * held for a few seconds, and Undo cancels it. So there is no state to reconcile
 * and no way for a deleted row to reappear somewhere the query forgot to filter
 * — the only cost is that closing the tab inside the window means the delete
 * never happens, which loses nothing.
 *
 * The window comes from the instance's config (`[ui] undo_seconds`); zero sends
 * immediately and shows no toast.
 */
export type Pending = {
	id: number;
	/** What vanished, for the toast: "Deleted olive oil". */
	label: string;
	/** Hidden from lists while this is pending — `${kind}:${id}`. */
	key: string;
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
	return undo.pending.some((p) => p.key === key);
}

/**
 * Hold a deletion for the undo window, then send it.
 *
 * With a window of zero it sends now, which is what an instance that has turned
 * this off wants.
 */
export function deleteLater(key: string, label: string, send: () => void): void {
	if (undo.seconds <= 0) {
		send();
		return;
	}

	const id = nextId++;
	const timer = setTimeout(() => {
		undo.pending = undo.pending.filter((p) => p.id !== id);
		send();
	}, undo.seconds * 1000);

	undo.pending = [
		...undo.pending,
		{ id, label, key, send, timer, until: Date.now() + undo.seconds * 1000 }
	];
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
 * Called when the page is being left: a delete somebody confirmed should not be
 * quietly forgotten because they clicked a link four seconds later.
 */
export function flushNow(): void {
	for (const p of undo.pending) {
		clearTimeout(p.timer);
		p.send();
	}
	undo.pending = [];
}
