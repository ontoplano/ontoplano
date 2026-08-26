/**
 * Ticking things off the shopping list without a signal.
 *
 * The service worker deliberately never replays writes: a queued POST firing on
 * reconnect could complete a task twice or undo something you have since put
 * back, and that needs real conflict handling.
 *
 * This is the one exception, and it is narrow on purpose. "I bought the milk"
 * is a single account setting a single boolean; replaying it late cannot
 * conflict with anything except the same person doing the opposite in the
 * meantime, and last-write-wins is what they would expect anyway. It is also
 * the only write anybody makes standing in a shop with no bars.
 *
 * Kept in `localStorage` so it survives the tab being closed on the way home.
 */
const KEY = 'shopping.pendingTicks';

export type Tick = { id: number; action: 'toggleBought' | 'toggleSnoozed' | 'restock' };

function read(): Tick[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(raw) ? raw : [];
	} catch {
		return [];
	}
}

function write(ticks: Tick[]): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(ticks));
	} catch {
		// A full or blocked storage is not a reason to lose the tick in memory.
	}
}

export const ticks = $state<{ pending: Tick[] }>({ pending: [] });

/** Read what a previous, possibly disconnected, session left behind. */
export function restore(): void {
	ticks.pending = read();
}

export function remember(tick: Tick): void {
	// The same item twice is the same intention: the last one wins, and two
	// toggles of the same button cancel out.
	const without = ticks.pending.filter((t) => !(t.id === tick.id && t.action === tick.action));
	ticks.pending = without.length === ticks.pending.length ? [...without, tick] : without;
	write(ticks.pending);
}

/**
 * Send what is waiting, oldest first, and keep anything that still fails.
 *
 * Sequential rather than parallel: they are all writes to the same list, and a
 * burst of them on a phone that has just found a signal is how you get half of
 * them dropped.
 */
export async function flush(): Promise<number> {
	if (ticks.pending.length === 0) return 0;

	const kept: Tick[] = [];
	let sent = 0;

	for (const tick of ticks.pending) {
		try {
			const body = new FormData();
			body.set('id', String(tick.id));

			const res = await fetch(`/shopping?/${tick.action}`, { method: 'POST', body });
			if (res.ok) sent++;
			else kept.push(tick);
		} catch {
			kept.push(tick);
		}
	}

	ticks.pending = kept;
	write(kept);
	return sent;
}
