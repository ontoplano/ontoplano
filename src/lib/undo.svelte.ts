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
	/**
	 * Sent, and now waiting on the server rather than on the person.
	 *
	 * The window ending is not the end of this entry. The request has to go,
	 * come back, and the page has to reload its data — and for those few
	 * hundred milliseconds the screen is still drawing the OLD answer. An
	 * entry dropped at the timer made a ticked todo reappear for a blink and
	 * then vanish, which reads as a bug in the tick. So it stays, holding the
	 * outcome on screen, until the write has actually landed; only the toast
	 * goes at the timer, because by then there is nothing left to take back.
	 */
	sent: boolean;
	send: () => void | Promise<unknown>;
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

/** The ones still worth a toast: sent is past taking back. */
export function undoable(): Pending[] {
	return undo.pending.filter((p) => !p.sent);
}

/**
 * Hold an action for the undo window, then send it.
 *
 * With a window of zero it sends now, which is what an instance that has turned
 * this off wants. A second action on the same row replaces the first: two holds
 * on one todo would fire in whichever order their timers landed.
 */
function hold(
	key: string,
	message: string,
	hides: boolean,
	send: () => void | Promise<unknown>
): void {
	if (undo.seconds <= 0) {
		void send();
		return;
	}

	for (const p of undo.pending.filter((p) => p.key === key)) clearTimeout(p.timer);
	undo.pending = undo.pending.filter((p) => p.key !== key);

	const id = nextId++;
	const timer = setTimeout(() => dispatch(id), undo.seconds * 1000);

	undo.pending = [
		...undo.pending,
		{ id, message, key, hides, sent: false, send, timer, until: Date.now() + undo.seconds * 1000 }
	];
}

/**
 * The window is over: send it, and hold the row's new state until it lands.
 *
 * Marked sent rather than dropped, so `isPending` stays true across the round
 * trip and the row does not flicker back to how it was. Dropped when the send
 * settles — or at once for a sender that hands back nothing to wait on, which
 * is the old behaviour and no worse than it was.
 */
function dispatch(id: number): void {
	const found = undo.pending.find((p) => p.id === id);
	if (!found || found.sent) return;

	clearTimeout(found.timer);
	undo.pending = undo.pending.map((p) => (p.id === id ? { ...p, sent: true } : p));

	const drop = () => {
		undo.pending = undo.pending.filter((p) => p.id !== id);
	};

	let result: void | Promise<unknown>;
	try {
		result = found.send();
	} catch {
		drop();
		return;
	}
	// A rejected send drops the entry too: holding the outcome on screen for a
	// write that failed is the one lie this must not tell.
	if (result && typeof (result as Promise<unknown>).then === 'function') {
		void (result as Promise<unknown>).then(drop, drop);
	} else {
		drop();
	}
}

/** A row that leaves the screen now and is deleted in a few seconds. */
export function deleteLater(key: string, label: string, send: () => void): void {
	hold(key, `Deleted ${label}`, true, send);
}

/** A row that shows its new state now and is written in a few seconds. */
export function changeLater(key: string, message: string, send: () => void): void {
	hold(key, message, false, send);
}

/**
 * Take back whatever is waiting on one row — clicking the tick again.
 *
 * Only what has not gone yet. An entry already sent is a request in flight,
 * and pretending it can be cancelled would leave the screen disagreeing with
 * the server.
 */
export function cancelFor(key: string): void {
	for (const p of undo.pending.filter((p) => p.key === key && !p.sent)) clearTimeout(p.timer);
	undo.pending = undo.pending.filter((p) => p.key !== key || p.sent);
}

export function takeBack(id: number): void {
	const found = undo.pending.find((p) => p.id === id);
	if (!found || found.sent) return;

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
	for (const p of undo.pending.filter((entry) => !entry.sent)) {
		clearTimeout(p.timer);
		void p.send();
	}
	undo.pending = [];
}
