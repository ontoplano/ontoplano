import { invalidateAll } from '$app/navigation';

/**
 * The browser half: hear that something changed, and reload the page's own data.
 *
 * `invalidateAll()` rather than a patch: every screen is already built by its
 * loaders, and re-running them is the one way to update a page that cannot
 * disagree with how the page was built in the first place. It is a cheap call —
 * SvelteKit refetches the loaders and Svelte updates only what actually
 * differs, so a list that gained one row does not flash.
 *
 * ## Three rules, each of which was a bug waiting
 *
 * **Only when the tab can be seen.** A laptop with forty tabs would otherwise
 * refetch forty screens nobody is looking at, every time an assistant wrote
 * anything. Hidden tabs remember that something happened and catch up when they
 * come back.
 *
 * **Never while somebody is typing.** A reload with a half-written note in a
 * textarea is the app eating their sentence. If a field is focused the reload
 * waits for it to be given up.
 *
 * **Coalesced.** An assistant doing six things does six announcements in two
 * seconds, and six reloads is a page that strobes. They collapse into one.
 */
const SETTLE_MS = 400;

export interface LiveChange {
	rooms: string[];
	at: string;
	via: 'assistant' | 'api' | 'app';
}

export type LiveOptions = {
	/** Reload only when one of these changed. Empty means any change. */
	rooms?: string[];
	/** Told after a reload actually happened, for a page that wants to say so. */
	onreload?: (change: LiveChange) => void;
};

/** Whether the person is in the middle of writing something. */
function busyTyping(): boolean {
	const el = document.activeElement;
	if (!el) return false;
	if (el instanceof HTMLTextAreaElement) return true;
	if (el instanceof HTMLInputElement)
		return !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
	return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Open the stream and keep the page current. Returns the function that closes it.
 *
 * Safe to call when there is no session: the endpoint answers 401, `EventSource`
 * retries, and nothing else happens. It is not called there anyway — the layout
 * only starts it for somebody signed in.
 */
export function live(options: LiveOptions = {}): () => void {
	if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {};

	const wanted = options.rooms ?? [];
	let pending: LiveChange | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let closed = false;
	let source: EventSource | null = null;

	const flush = () => {
		timer = null;
		if (closed || !pending) return;

		// Not now: the tab is in the background, or a sentence is half written.
		// The change is kept, and this runs again when the reason goes away.
		if (document.visibilityState !== 'visible' || busyTyping()) return;

		const change = pending;
		pending = null;
		void invalidateAll().then(() => options.onreload?.(change));
	};

	const later = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, SETTLE_MS);
	};

	/*
	 * Opened once the page has finished loading itself.
	 *
	 * A stream is a request that never completes, so opening it during load
	 * means the page never reaches an idle network — which breaks anything
	 * waiting for one, the test suite included, and competes with the requests
	 * that draw the first screen. `requestIdleCallback` with a timeout gets it
	 * open promptly on a fast machine and still gets it open on a slow one.
	 */
	const open = () => {
		if (closed) return;
		source = new EventSource('/api/live');
		source.addEventListener('changed', onChanged);
	};

	const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
		.requestIdleCallback;
	if (idle) idle(open, { timeout: 2000 });
	else setTimeout(open, 1200);

	function onChanged(event: Event) {
		let change: LiveChange;
		try {
			change = JSON.parse((event as MessageEvent).data);
		} catch {
			return;
		}

		if (wanted.length > 0 && !change.rooms.some((r) => wanted.includes(r))) return;
		pending = change;
		later();
	}

	// A tab coming back to the front acts on whatever it missed, at once —
	// the point of noticing is that the screen is right when somebody looks.
	const onVisible = () => {
		if (document.visibilityState === 'visible' && pending) flush();
	};
	document.addEventListener('visibilitychange', onVisible);

	// And the moment they stop typing.
	const onBlur = () => {
		if (pending) later();
	};
	document.addEventListener('focusout', onBlur);

	return () => {
		closed = true;
		if (timer) clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisible);
		document.removeEventListener('focusout', onBlur);
		source?.close();
		source = null;
	};
}
