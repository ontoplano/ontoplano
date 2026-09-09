/**
 * An action you can take back, in one of two ways.
 *
 * ## A change happens now
 *
 * Ticking something off writes it immediately and Undo writes the opposite —
 * done, then back to todo. It used to hold the request for the length of the
 * toast, which made the tick a lie for five seconds: the row it was on showed
 * done while the rest of the page, drawn from data the server had not been
 * told about, still said otherwise. Two parts of one screen disagreeing is
 * worse than the write it was avoiding.
 *
 * Every change that offers this has an inverse — the app requires one for
 * anything that changes state — so Undo is an ordinary write and not an
 * unwinding of something half-applied.
 *
 * ## A deletion waits
 *
 * A deletion has no inverse, so the only honest undo is not to have done it
 * yet. The row is hidden at once and the request is held for the window: there
 * is nothing soft-deleted, nothing provisional, and no way for a deleted thing
 * to survive somewhere a query forgot to filter. The cost is that closing the
 * tab inside the window means the deletion never happens, which loses nothing.
 *
 * A list asks `isLeaving` for the first shape and `isPending` for the second.
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
	/**
	 * How to put it back, for a change that has already been written.
	 *
	 * Absent on a deletion, which is taken back by never sending it. Present on
	 * a change, where Undo is a second write in the opposite direction.
	 */
	revert?: () => void | Promise<unknown>;
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

/**
 * A row that is written now, and can be written back for a few seconds.
 *
 * `send` goes at once; `revert` is what Undo — or a second press on the same
 * row — sends instead. With the window turned off there is nothing to take
 * back, so it is a plain write.
 */
export function changeNow(
	key: string,
	message: string,
	send: () => void | Promise<unknown>,
	revert: () => void | Promise<unknown>
): void {
	if (undo.seconds <= 0) {
		void send();
		return;
	}

	for (const p of undo.pending.filter((p) => p.key === key)) clearTimeout(p.timer);
	undo.pending = undo.pending.filter((p) => p.key !== key);

	const id = nextId++;

	/*
	 * The window closing does not write anything — that already happened. It
	 * only takes the offer away, and then the entry lingers until the write
	 * and its reload have landed.
	 *
	 * That last part is the same protection a held send has: until the page has
	 * the server's new answer it is still drawing the old one, and an entry
	 * dropped before then makes the row flick back to undone and then done
	 * again. Almost always the reload beats the window; this is for when it
	 * does not.
	 */
	const drop = () => {
		undo.pending = undo.pending.filter((p) => p.id !== id);
	};

	/** Whatever `send` handed back, so the entry can wait on it. */
	const settling = send();

	const timer = setTimeout(() => {
		const found = undo.pending.find((p) => p.id === id);
		if (!found) return;
		undo.pending = undo.pending.map((p) => (p.id === id ? { ...p, sent: true } : p));
		if (settling && typeof settling.then === 'function') void settling.then(drop, drop);
		else drop();
	}, undo.seconds * 1000);

	undo.pending = [
		...undo.pending,
		{
			id,
			message,
			key,
			hides: false,
			sent: false,
			send: () => {},
			revert,
			timer,
			until: Date.now() + undo.seconds * 1000
		}
	];
}

/**
 * Take back whatever is waiting on one row — clicking the tick again.
 *
 * Only what has not gone yet. An entry already sent is a request in flight,
 * and pretending it can be cancelled would leave the screen disagreeing with
 * the server.
 */
export function cancelFor(key: string): void {
	for (const p of undo.pending.filter((p) => p.key === key && !p.sent)) {
		clearTimeout(p.timer);
		// A change is already written, so taking it back is a write of its own.
		// A deletion is taken back by the timer never firing.
		if (p.revert) void p.revert();
	}
	undo.pending = undo.pending.filter((p) => p.key !== key || p.sent);
}

export function takeBack(id: number): void {
	const found = undo.pending.find((p) => p.id === id);
	if (!found || found.sent) return;

	clearTimeout(found.timer);
	undo.pending = undo.pending.filter((p) => p.id !== id);
	if (found.revert) void found.revert();
}

/**
 * Send every held action now, because the page is being left.
 *
 * Something somebody confirmed should not be quietly forgotten because they
 * clicked a link four seconds later. That is about deletions, which are the
 * only thing still waiting to be sent.
 *
 * A change is left exactly where it is. It has already been written, its offer
 * to reverse it still stands, and dropping it here retracted that offer the
 * instant the write landed — the board reloads itself with `goto`, which is a
 * navigation, so the Undo button vanished under the cursor about a fifth of a
 * second after appearing. An offer that disappears while you are reaching for
 * it is worse than no offer.
 */
export function flushNow(): void {
	for (const p of undo.pending.filter((entry) => !entry.sent && !entry.revert)) {
		clearTimeout(p.timer);
		void p.send();
	}
	undo.pending = undo.pending.filter((p) => Boolean(p.revert));
}
